import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getDoc, sourceUrl } from '../content';
import { BAND, revisionOf } from '../design';
import { useMedia, WIDE } from '../useMedia';
import { LaunchIcon } from './Icons';
import Markdown from './Markdown';
import Toc from './Toc';

export default function DocPage() {
  const { slug } = useParams();
  const { hash } = useLocation();
  const doc = getDoc(slug);
  const wide = useMedia(WIDE);

  // New document -> start at the top (only when there is no target anchor).
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // React Router does not scroll to a hash target on its own.
  useEffect(() => {
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      id = hash.slice(1);
    }
    // Wait a frame so the markdown has been committed to the DOM.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const band = document.querySelector('.band')?.getBoundingClientRect().height ?? BAND;
      const top = el.getBoundingClientRect().top + window.scrollY - (band + 16);
      // Lands on the heading, in one step. Nothing in this world eases.
      window.scrollTo({ top });
    });
    return () => cancelAnimationFrame(raf);
  }, [hash, slug]);

  if (!doc) {
    return (
      <main className="doc">
        <div className="missing">
          <p className="missing__head">找不到這一頁</p>
          <p>
            索引裡沒有 <code className="md-code">{slug}</code>。請從左側索引選一份文件。
          </p>
        </div>
      </main>
    );
  }

  const gh = sourceUrl(doc);
  const rev = revisionOf(doc.markdown);

  return (
    // `key` retriggers the leaf-turn animation on every route change.
    <main className="doc" key={doc.slug}>
      <div className="doc__sheet">
        {/*
          The single-source guarantee, in the machine's voice: which file this
          is, how many bytes of it, and how long ago it was last touched. It
          sits at the head of every page because it is the one claim on this
          site a competitor cannot truthfully copy.
        */}
        <div className="prov">
          <span className="prov__pair">
            <span className="prov__k">source</span>
            <span className="prov__v prov__v--file">{doc.file}</span>
          </span>
          <span className="prov__pair">
            <span className="prov__k">bytes</span>
            <span className="prov__v">{doc.bytes.toLocaleString('en-US')}</span>
          </span>
          {rev && (
            <span className="prov__pair prov__age" data-step={rev.step}>
              <span className="prov__k">rev</span>
              <span className="prov__v">
                {rev.date} · {rev.days} 天前
              </span>
              {/* Age is a word as well as a wash: a reader who cannot see the
                  yellowing still reads that the page has gone stale. Rendered
                  here rather than through CSS `content:` so it can be selected,
                  translated and caught by the smoke test. */}
              {rev.step === 2 && <span className="prov__stale">年久未修</span>}
            </span>
          )}
          {gh && (
            <a className="prov__link" href={gh} target="_blank" rel="noreferrer">
              在 GitHub 檢視
              <LaunchIcon />
            </a>
          )}
        </div>

        <div className="prose">
          <Markdown markdown={doc.markdown} baseDir={doc.dir} />
        </div>

        {wide && <Toc markdown={doc.markdown} className="toc--margin" />}
      </div>
    </main>
  );
}
