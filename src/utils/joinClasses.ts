export default function joinClasses(
  ...args: Array<string | boolean | null | undefined>
) {
  return args.filter(Boolean).join(' ');
}
