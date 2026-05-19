export function setCanonical(path: string) {
  const href = `https://actsolo.ai${path}`;
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  const prev = link.href;
  link.href = href;
  return () => {
    if (link) link!.href = prev;
  };
}