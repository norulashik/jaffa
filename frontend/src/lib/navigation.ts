export function getCafePrefix(): string {
  if (typeof window === "undefined") return "";
  const slug = localStorage.getItem("jaffa_venue_slug");
  return slug ? `/cafe/${slug}` : "";
}

export function cafeUrl(path: string): string {
  return `${getCafePrefix()}${path}`;
}
