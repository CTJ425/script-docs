# Kubernetes 1.36 叢集部署（CRI-O + Calico / Rocky Linux 9）

在 RHEL 家族主機上建立 Kubernetes 叢集，容器執行環境用 CRI-O，CNI 用 Calico。
另附 MetalLB、KubeVirt、Gateway API、TrueNAS CSI 的安裝步驟。

---

## 一鍵建立叢集

先在**每個節點**跑前置設定（[k8s_env_init](../k8s_env_init)），重開機後再建叢集：

```bash
# 0. 全部節點：前置環境（swap / SELinux / 核心模組 / sysctl）後重開機
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_env_init/k8s_env_initialization.sh | sudo bash -s -- --yes

# 1. Control Plane：安裝 CRI-O + kubeadm 並初始化，含 Calico
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_install/k8s_cluster_install.sh | sudo bash -s -- \
  --role cp --apiserver-advertise-address 10.0.1.10 --yes

# 2. 每個 Worker：貼上 CP 最後印出的 join 指令
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_install/k8s_cluster_install.sh | sudo bash -s -- \
  --role worker --yes \
  --join "kubeadm join 10.0.1.10:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>"
```

第一次使用建議先加 `--dry-run`，腳本會印出每一條會執行的指令而不動系統。

| 參數 | 預設 | 說明 |
| :--- | :--- | :--- |
| `--role cp\|worker` | （必填） | 這台節點的角色。 |
| `--join "<cmd>"` | — | Worker 必填，CP 執行 `kubeadm token create --print-join-command` 取得。缺少 `--cri-socket` 會自動補上。 |
| `--k8s-version` | `v1.36` | 套件庫的 minor 版本。 |
| `--k8s-patch` | `v1.36.2` | `kubeadm init` 鎖定的確切版本。 |
| `--crio-version` | 同 `--k8s-version` | CRI-O 版本，必須對齊 K8s minor。 |
| `--calico-version` | `v3.32.1` | Calico 版本。 |
| `--pod-cidr` | `10.244.0.0/16` | Pod 網段，會自動同步到 Calico 設定。 |
| `--apiserver-advertise-address` | 主要網卡 IP | API Server 對外位址。 |
| `--skip-calico` | — | CP 不安裝 CNI（想自己裝別的 CNI 時用）。 |
| `-n`, `--dry-run` | — | 只印指令，不執行。 |
| `-y`, `--yes` | — | 不詢問確認。 |

腳本會先檢查 swap、核心模組、sysctl 等前置條件，缺少時警告並讓你決定是否繼續。

完成後驗證：

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get tigerastatus
```

> [!NOTE]
> 要做多 Control Plane 的高可用架構，**必須在第一次 `kubeadm init` 就指定 `--control-plane-endpoint`**。
> 這支腳本目前只建立單 CP，HA 請看下方「擴充節點」章節手動處理。

---

## 環境規格

| 項目 | 版本 |
| :--- | :--- |
| OS | Rocky Linux 9.8（RHEL / AlmaLinux 同適用） |
| Kubernetes | v1.36.2（EOL 2027-06-28） |
| 容器執行環境 | CRI-O v1.36 |
| CNI | Calico v3.32.1（Tigera Operator） |
| Pod CIDR | `10.244.0.0/16` |

主機規劃範例：

| 角色 | Hostname | IP | 規格 |
| :--- | :--- | :--- | :--- |
| Control Plane | k8s-cp01 | 10.0.1.10 | 2C / 4G |
| Worker | k8s-wk01 | 10.0.1.11 | 2C / 4G |
| Worker | k8s-wk02 | 10.0.1.12 | 2C / 4G |

---

## 手動安裝步驟

一鍵腳本做的就是以下 1–6 節。想自己一步步跑或需要客製時參考。

### 1. 系統前置準備（全部節點）

主機名稱與 hosts：

```bash
sudo hostnamectl set-hostname k8s-cp01     # 依節點調整

cat <<EOF | sudo tee -a /etc/hosts
10.0.1.10 k8s-cp01
10.0.1.11 k8s-wk01
10.0.1.12 k8s-wk02
EOF
```

其餘（swap、SELinux、核心模組、sysctl、防火牆）交給 [k8s_env_init](../k8s_env_init)，或手動：

```bash
# swap
sudo swapoff -a
sudo sed -r -i '/\s+swap\s+/s/^#*/#/' /etc/fstab

# SELinux（permissive 或用 selinux=0 核心參數）
sudo setenforce 0
sudo sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config

# 核心模組
cat <<EOF | sudo tee /etc/modules-load.d/crio.conf
overlay
br_netfilter
EOF
sudo modprobe overlay && sudo modprobe br_netfilter

# sysctl
cat <<EOF | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
sudo sysctl --system

# 時間同步
sudo dnf install -y chrony && sudo systemctl enable --now chronyd
```

防火牆若保留啟用，需開放：

```bash
# Control Plane
sudo firewall-cmd --permanent --add-port={6443,2379-2380,10250-10259}/tcp
# Worker
sudo firewall-cmd --permanent --add-port={10250,10256}/tcp --add-port=30000-32767/tcp
# 全部節點（Calico VXLAN）
sudo firewall-cmd --permanent --add-port=4789/udp
sudo firewall-cmd --reload
```

### 2. 安裝 CRI-O（全部節點）

CRI-O 已從 `pkgs.k8s.io` 移到 openSUSE Build Service，版本需對齊 Kubernetes minor 版本。

```bash
export CRIO_VERSION=v1.36

cat <<EOF | sudo tee /etc/yum.repos.d/cri-o.repo
[cri-o]
name=CRI-O
baseurl=https://download.opensuse.org/repositories/isv:/cri-o:/stable:/$CRIO_VERSION/rpm/
enabled=1
gpgcheck=1
gpgkey=https://download.opensuse.org/repositories/isv:/cri-o:/stable:/$CRIO_VERSION/rpm/repodata/repomd.xml.key
EOF

sudo dnf install -y cri-o
```

cgroup driver 必須與 kubelet 一致（都用 `systemd`）：

```bash
sudo mkdir -p /etc/crio/crio.conf.d
cat <<EOF | sudo tee /etc/crio/crio.conf.d/02-cgroup-manager.conf
[crio.runtime]
cgroup_manager = "systemd"
conmon_cgroup = "pod"
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now crio
```

### 3. 安裝 kubeadm / kubelet / kubectl（全部節點）

```bash
export KUBERNETES_VERSION=v1.36

cat <<EOF | sudo tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/$KUBERNETES_VERSION/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/$KUBERNETES_VERSION/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF

sudo dnf install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
sudo systemctl enable --now kubelet
```

`exclude=` 可避免 `dnf update` 意外跳到下一個 minor 版本；要升級時才加 `--disableexcludes=kubernetes`。

確認版本（CRI-O 是獨立套件，要另外查）：

```bash
kubeadm version && kubectl version --client && crictl --version && crio --version
```

### 4. 初始化 Control Plane

Calico 搭配 kube-proxy 運作，所以不需要 `--skip-phases=addon/kube-proxy`。

```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=10.0.1.10 \
  --cri-socket=unix:///var/run/crio/crio.sock \
  --kubernetes-version=v1.36.2

mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

記下輸出的 `kubeadm join` 指令。Token 預設 24 小時過期，之後可重新產生：

```bash
kubeadm token create --print-join-command
```

### 5. Worker 加入叢集

```bash
sudo kubeadm join 10.0.1.10:6443 \
  --token <TOKEN> \
  --discovery-token-ca-cert-hash sha256:<HASH> \
  --cri-socket=unix:///var/run/crio/crio.sock
```

此時節點是 `NotReady`，因為還沒裝 CNI。

### 6. 安裝 Calico CNI（在 CP 執行）

用官方推薦的 Tigera Operator 安裝（而非舊式單一 manifest），Operator 會處理 Typha 擴展與升級。

```bash
CALICO_VERSION=v3.32.1

kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/v1_crd_projectcalico_org.yaml
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/tigera-operator.yaml

kubectl wait --for=condition=Available deployment/tigera-operator -n tigera-operator --timeout=120s
```

> [!IMPORTANT]
> 官方 `custom-resources.yaml` 預設 CIDR 是 `192.168.0.0/16`，**必須改成與 `kubeadm init` 的 `--pod-network-cidr` 一致**，否則 `calico-node` 永遠不會就緒。

```bash
curl -O https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/custom-resources.yaml
sed -i 's#cidr: 192\.168\.0\.0/16#cidr: 10.244.0.0/16#' custom-resources.yaml
kubectl create -f custom-resources.yaml

kubectl wait --for=condition=Available tigerastatus/calico --timeout=300s
kubectl get pods -n calico-system
```

預設封裝是 VXLAN（`VXLANCrossSubnet`），適合大多數私有環境。節點間已能直接路由時可改 `encapsulation: None` 提升效能。

查 Calico 版本（不需要另外裝 calicoctl）：

```bash
kubectl get installation default -o jsonpath='{.status.calicoVersion}'; echo
```

需要 `calicoctl` CLI 的話得手動下載，它不隨 Operator 安裝：

```bash
curl -L https://github.com/projectcalico/calico/releases/download/${CALICO_VERSION}/calicoctl-linux-amd64 -o calicoctl
chmod +x calicoctl && sudo mv calicoctl /usr/local/bin/
```

---

## MetalLB（LoadBalancer 服務）

地端叢集沒有雲端 LB 控制器，`Service type: LoadBalancer` 會永遠卡在 `<pending>`。MetalLB 補上這塊。以下用最單純的 Layer2 模式（靠 ARP/NDP 廣播，不需要 BGP 路由器）。

安裝前：確認叢集內沒有其他 LB controller；準備一段**未被使用、與節點同網段**的 IP 區段。

```bash
METALLB_VERSION=v0.16.1
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml

kubectl wait --namespace metallb-system --for=condition=ready pod \
  --selector=app=metallb --timeout=120s
```

設定 IP 池與 L2 廣播：

```bash
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 10.0.1.200-10.0.1.220
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - default-pool
EOF
```

測試：

```bash
kubectl create deployment nginx-demo --image=nginx --port=80
kubectl expose deployment nginx-demo --port=80 --type=LoadBalancer --name=nginx-lb
kubectl get svc nginx-lb -w        # 等 EXTERNAL-IP 從 <pending> 變成實際 IP
curl http://10.0.1.200

kubectl delete svc nginx-lb && kubectl delete deployment nginx-demo
```

kubeadm 預設 `kube-proxy` 是 iptables 模式，**不需要** strict ARP。只有手動改成 IPVS 模式時才需要：

```bash
kubectl get configmap kube-proxy -n kube-system -o yaml | \
  sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
kubectl rollout restart daemonset kube-proxy -n kube-system
```

| 症狀 | 排查方向 |
|---|---|
| `EXTERNAL-IP` 一直 `<pending>` | `kubectl describe ipaddresspool default-pool -n metallb-system`，確認池裡還有未分配 IP |
| 拿到 IP 但連不到 | 確認該 IP 與節點同 L2 網段；`kubectl logs -n metallb-system -l component=speaker` |
| 多個 LB controller 搶 IP | 確認沒有其他 LB controller，或用 `loadBalancerClass` 區隔 |

---

## KubeVirt（在 K8s 上跑虛擬機）

用 Kubernetes 原生資源（`VirtualMachine` / `VirtualMachineInstance`）管理傳統虛擬機。

> [!NOTE]
> KubeVirt v1.8 官方對齊 K8s v1.35 並支援前兩版（約 v1.33–v1.35）。本文叢集為 v1.36，超出官方驗證範圍，實務上通常可運作。正式環境請先查 [support matrix](https://kubevirt.io/support-matrix/)。

節點前置需求（VM 是以容器包 QEMU/KVM 的形式運作）：

```bash
# 確認 CPU 虛擬化擴充（實體機需在 BIOS 開 VT-x/AMD-V；節點本身是 VM 則需開巢狀虛擬化）
lscpu | grep -E 'Virtualization'

# 載入 KVM 模組並確認 /dev/kvm 存在
sudo modprobe kvm
sudo modprobe kvm_intel        # AMD 用 kvm_amd
ls -l /dev/kvm

# （選用）驗證環境
sudo dnf install -y qemu-kvm libvirt virt-host-validate
sudo virt-host-validate qemu
```

沒有 `/dev/kvm` 時 KubeVirt 仍能跑，但會退回軟體模擬模式，效能明顯較差。

安裝：

```bash
export KUBEVIRT_VERSION=v1.8.4

kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml
kubectl wait --for=condition=Ready pod -l kubevirt.io=virt-operator -n kubevirt --timeout=120s

kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml
kubectl -n kubevirt wait kv kubevirt --for condition=Available --timeout=300s

kubectl get pods -n kubevirt
```

安裝 `virtctl`（不隨 Operator 安裝）：

```bash
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
curl -L -o virtctl \
  https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/virtctl-${KUBEVIRT_VERSION}-linux-${ARCH}
sudo install -m 0755 virtctl /usr/local/bin/virtctl
virtctl version
```

建立測試 VM：

```bash
cat <<EOF | kubectl apply -f -
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: testvm
  namespace: default
spec:
  running: false
  template:
    metadata:
      labels:
        kubevirt.io/domain: testvm
    spec:
      domain:
        cpu:
          cores: 1
        resources:
          requests:
            memory: 512Mi
        devices:
          disks:
            - name: containerdisk
              disk:
                bus: virtio
            - name: cloudinitdisk
              disk:
                bus: virtio
      volumes:
        - name: containerdisk
          containerDisk:
            image: quay.io/containerdisks/cirros:latest
        - name: cloudinitdisk
          cloudInitNoCloud:
            userData: |
              #cloud-config
              password: kubevirt
              chpasswd: { expire: False }
EOF

virtctl start testvm
kubectl get vm,vmi
virtctl console testvm      # 離開按 Ctrl+]

virtctl stop testvm && kubectl delete vm testvm
```

| 症狀 | 排查方向 |
|---|---|
| `virt-handler` `Init:Error` / CrashLoop | 節點是否有 `/dev/kvm`；SELinux 是否阻擋（`journalctl -b \| grep -i denied`） |
| VM 卡在 `Scheduling` | `kubectl describe vmi <name>`，常是資源不足或 label/taint |
| 沒有硬體虛擬化 | `kubectl -n kubevirt patch kubevirt kubevirt --type=merge --patch '{"spec":{"configuration":{"developerConfiguration":{"useEmulation":true}}}}'`（僅測試環境） |
| virtctl 版本不符 | `kubectl get kubevirt -n kubevirt -o=jsonpath="{.items[0].status.observedKubeVirtVersion}"` |

---

## Gateway API

Gateway API 是 Ingress 的後繼者（Ingress-NGINX 已於 2026-03 進入僅維護模式）。這裡用 **Calico 內建的 Ingress Gateway**（Tigera Operator 管理的上游 Envoy Gateway 發行版），不需要額外裝 Istio 或其他 controller。Gateway 會建立 `type: LoadBalancer` 的 Service，所以建議搭配上面的 MetalLB。

```bash
# 1. Gateway API CRDs（Standard channel）
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.0/standard-install.yaml
kubectl get crd | grep gateway.networking.k8s.io

# 2. 啟用 Calico Ingress Gateway，Operator 會自動建立 tigera-gateway-class
cat <<EOF | kubectl apply -f -
apiVersion: operator.tigera.io/v1
kind: GatewayAPI
metadata:
  name: default
EOF

kubectl get tigerastatus gateway-api-connectivity -w    # 約 1~2 分鐘
kubectl get gatewayclass
```

建立 Gateway 與 HTTPRoute：

```bash
kubectl create deployment web-demo --image=nginx --port=80
kubectl expose deployment web-demo --port=80

cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: demo-gateway
  namespace: default
spec:
  gatewayClassName: tigera-gateway-class
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: Same
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-demo-route
  namespace: default
spec:
  parentRefs:
  - name: demo-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: web-demo
      port: 80
EOF

kubectl wait --for=condition=Programmed gateway/demo-gateway --timeout=120s
kubectl get gateway demo-gateway -o jsonpath='{.status.addresses[0].value}'; echo
```

| 症狀 | 排查方向 |
|---|---|
| 沒有 `tigera-gateway-class` | 確認 `GatewayAPI` CR 已建立、`tigerastatus gateway-api-connectivity` 是否 Available；能否連外拉映像 |
| Gateway 沒有 `status.addresses` | MetalLB 是否安裝且池裡有可用 IP；`kubectl describe gateway demo-gateway` |
| HTTPRoute 建了但 404 | `parentRefs` 名稱要與 Gateway 一致、後端 Service/port 存在；跨 namespace 需 `ReferenceGrant` |

---

## TrueNAS CSI

[truenas-csi](https://github.com/truenas/truenas-csi) 透過 TrueNAS 的 Websocket API 動態建立 NFS（RWX）或 iSCSI（RWO）持久化儲存，支援擴充、快照與 Clone。以下以 NFS 為主。

前置需求：TrueNAS SCALE 25.10.0+（已開 API 存取、至少一個 ZFS pool）、K8s 1.26+。
NFS 不需要節點額外套件；要用 iSCSI 則全部 Worker 需安裝：

```bash
sudo dnf install -y iscsi-initiator-utils
sudo systemctl enable --now iscsid
```

在 TrueNAS 網頁介面建立 API Key（右上角個人資料 → API Keys），稍後填進 Secret。

（選用）要用快照就先裝 external-snapshotter：

```bash
BASE=https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master
kubectl apply -f $BASE/client/config/crd/snapshot.storage.k8s.io_volumesnapshotclasses.yaml
kubectl apply -f $BASE/client/config/crd/snapshot.storage.k8s.io_volumesnapshotcontents.yaml
kubectl apply -f $BASE/client/config/crd/snapshot.storage.k8s.io_volumesnapshots.yaml
kubectl apply -f $BASE/deploy/kubernetes/snapshot-controller/rbac-snapshot-controller.yaml
kubectl apply -f $BASE/deploy/kubernetes/snapshot-controller/setup-snapshot-controller.yaml
```

部署驅動：

```bash
curl -O https://raw.githubusercontent.com/truenas/truenas-csi/master/deploy/truenas-csi-driver.yaml
```

編輯 manifest 的 ConfigMap 與 Secret：

```yaml
truenasURL: "wss://<TRUENAS_IP>/api/current"
truenasInsecure: "true"           # TrueNAS 用自簽憑證時
defaultPool: "tank"
nfsServer: "<TRUENAS_IP>"
iscsiPortal: "<TRUENAS_IP>:3260"  # 只有要用 iSCSI 才需要
iscsiIQNBase: "iqn.2005-10.org.freenas.ctl"
```

> [!WARNING]
> 要把設定納入 Git 版控時，請把含 API Key 的 Secret 從 manifest 拆出來，改用 `kubectl create secret` 或 Sealed Secrets / External Secrets 管理，不要把明碼寫進版控。

```bash
kubectl apply -f truenas-csi-driver.yaml
kubectl get pods -n truenas-csi
kubectl get csidrivers
```

StorageClass 與測試 PVC：

```bash
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: truenas-nfs
provisioner: csi.truenas.io
parameters:
  protocol: nfs
  pool: tank
  compression: "lz4"
  sync: "standard"
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: Immediate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-nfs-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: truenas-nfs
  resources:
    requests:
      storage: 5Gi
EOF

kubectl get pvc demo-nfs-pvc
```

iSCSI 版本只需把 `protocol: iscsi`、加上 `volblocksize: "4K"`，PVC 的 `accessModes` 用 `ReadWriteOnce`。

快照與 Clone：

```bash
cat <<EOF | kubectl apply -f -
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: truenas-snapshot-class
driver: csi.truenas.io
deletionPolicy: Delete
---
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: demo-nfs-snapshot
  namespace: default
spec:
  volumeSnapshotClassName: truenas-snapshot-class
  source:
    persistentVolumeClaimName: demo-nfs-pvc
EOF
```

還原成新 PVC：在 PVC 的 spec 加上 `dataSource: { name: demo-nfs-snapshot, kind: VolumeSnapshot, apiGroup: snapshot.storage.k8s.io }`。

| 症狀 | 排查方向 |
|---|---|
| PVC 一直 `Pending` | `kubectl describe pvc <name>`；確認 controller pod Running、ConfigMap 的 `truenasURL` 與 API Key 正確 |
| iSCSI 卷連不上 | Worker 是否 `systemctl status iscsid`；TrueNAS 的 Portal/Target 與 `iscsiPortal` 是否一致 |
| VolumeSnapshot 沒有 `readyToUse` | 是否已裝 external-snapshotter CRD 與 controller |
| TLS 憑證錯誤 | 自簽憑證需 `truenasInsecure: "true"`；正式環境建議換正式憑證 |

---

## 擴充節點

### 加入 Worker

新節點先完成前置設定與 CRI-O / kubeadm 安裝（或直接用一鍵腳本的 `--role worker`），然後：

```bash
# 在 CP 產生 join 指令（token 預設 24 小時過期）
kubeadm token create --print-join-command
```

加入後在 CP 確認，新節點會自動出現 `calico-node` pod，Running 後轉為 `Ready`：

```bash
kubectl get nodes -o wide
kubectl -n calico-system get pods -o wide
```

### 擴充 Control Plane（HA）

> [!IMPORTANT]
> 多 CP 高可用**必須在規劃階段就用 `--control-plane-endpoint`** 指定穩定入口（VIP / LB）。
> 若已用單 IP 建好叢集，事後硬加 CP 會留下所有 kubeconfig 仍指向第一台 CP 的問題 —— 原 CP 掛掉時整個叢集還是連不上。

**建議路徑（尚未建置）**：先準備 VIP / LB（例如 keepalived + HAProxy，假設 `10.0.1.100:6443`）導向所有 CP 的 6443，第一台 CP 這樣初始化：

```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --control-plane-endpoint="10.0.1.100:6443" \
  --upload-certs \
  --cri-socket=unix:///var/run/crio/crio.sock \
  --kubernetes-version=v1.36.2
```

輸出會給兩種 join 指令。CP 用的那個含 `--certificate-key`（預設 2 小時有效）：

```bash
sudo kubeadm join 10.0.1.100:6443 \
  --token <TOKEN> \
  --discovery-token-ca-cert-hash sha256:<HASH> \
  --control-plane \
  --certificate-key <CERTIFICATE_KEY> \
  --cri-socket=unix:///var/run/crio/crio.sock
```

`--certificate-key` 過期後在既有 CP 重新產生：`sudo kubeadm init phase upload-certs --upload-certs`

CP 數量要維持奇數（1 → 3 → 5）以符合 etcd 多數決，不要停在 2 台。

**補救路徑（已是單 CP）**：風險較高，建議先在測試環境演練並備份 etcd。

```bash
# 1. 建好 LB/VIP 後修改 controlPlaneEndpoint
kubectl -n kube-system edit cm kubeadm-config
#    將 ClusterConfiguration.controlPlaneEndpoint 設為 "10.0.1.100:6443"

# 2. 重新簽發含新 SAN 的 API Server 憑證
sudo cp -a /etc/kubernetes/pki /etc/kubernetes/pki.backup.$(date +%Y%m%d%H%M%S)
sudo mv /etc/kubernetes/pki/apiserver.crt /etc/kubernetes/pki/apiserver.crt.bak
sudo mv /etc/kubernetes/pki/apiserver.key /etc/kubernetes/pki/apiserver.key.bak
sudo kubeadm init phase certs apiserver --control-plane-endpoint "10.0.1.100:6443"
sudo systemctl restart kubelet

# 3. 確認所有節點的 kubeconfig 改指向新位址後，再照建議路徑加入新 CP
```

若條件允許，直接用建議路徑重建一座新叢集再遷移工作負載會更穩妥。

### etcd 備份

變更 CP 拓樸前務必先備份：

```bash
sudo ETCDCTL_API=3 etcdctl snapshot save /root/etcd-backup-$(date +%Y%m%d%H%M).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

---

## 常見問題排查

| 症狀 | 排查方向 |
|---|---|
| 節點長時間 `NotReady` | `kubectl -n calico-system logs ds/calico-node`；確認 br_netfilter 與 sysctl 生效 |
| `crictl` 連不到 runtime | 確認 `crio` 服務狀態，以及 `/etc/crictl.yaml` 的 `runtime-endpoint` 指向 `unix:///var/run/crio/crio.sock` |
| join token 過期 | 在 CP 執行 `kubeadm token create --print-join-command` |
| SELinux 導致 Pod 起不來 | 先 `setenforce 0` 測試是否為 SELinux 阻擋，再決定要不要寫 policy |
| 跨節點 Pod 不通 | 確認全部節點開放 `4789/udp`（VXLAN），且 firewalld zone 沒擋掉 `vxlan.calico` 網卡 |
| `tigerastatus/calico` 一直未 Available | `kubectl get tigerastatus calico -o yaml`；最常見是 `custom-resources.yaml` 的 CIDR 與 `--pod-network-cidr` 不一致 |
| `--certificate-key` 過期 | 在既有 CP 執行 `sudo kubeadm init phase upload-certs --upload-certs` |

---

## 版本備查

| 元件 | 版本 | 備註 |
| :--- | :--- | :--- |
| Kubernetes | v1.36.2 | 2026-06-09 釋出，EOL 2027-06-28 |
| CRI-O | v1.36 | 需對齊 K8s minor 版本 |
| Calico | v3.32.1 | Tigera Operator；K8s 1.36 的 `MutatingAdmissionPolicy` 已 GA，不需另開 feature gate |
| MetalLB | v0.16.1 | manifest 安裝，Layer2 模式 |
| KubeVirt | v1.8.4 | 官方對齊 K8s v1.35，v1.36 超出正式驗證範圍 |
| Gateway API | v1.6.0 | Standard channel + Calico Ingress Gateway |
| TrueNAS CSI | master | 需 TrueNAS SCALE 25.10.0+、K8s 1.26+ |

正式環境套用前建議再到各官方頁面確認當下的 patch 版本與相容性。

---

## 授權

MIT License。
