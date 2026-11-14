function join(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("/");
}

function resolve(...parts: string[]): string {
  const joined = join(...parts);
  return joined.length > 0 ? joined : ".";
}

export { join, resolve };
export default { join, resolve };
