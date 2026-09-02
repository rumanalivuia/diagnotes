/** Render rich-text blocks as inert React elements (text nodes only). */
export function renderBlocks(blocks = []) {
  return blocks.map((b, i) => {
    if (!b) return null;
    if (b.t === 'ul' || b.t === 'ol') {
      const Tag = b.t === 'ul' ? 'ul' : 'ol';
      return (
        <Tag key={i}>
          {(b.items || []).map((item, j) => (
            <li key={j}>{renderRuns(item.r)}</li>
          ))}
        </Tag>
      );
    }
    return <p key={i}>{renderRuns(b.r)}</p>;
  });
}

export function renderRuns(runs = []) {
  return runs.map((r, i) => {
    if (typeof r === 'string') return r;
    const text = r.x ?? '';
    if (r.b) return <b key={i}>{text}</b>;
    if (r.i) return <i key={i}>{text}</i>;
    if (r.u) return <u key={i}>{text}</u>;
    return text;
  });
}
