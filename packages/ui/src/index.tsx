import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
export function Button({
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button {...props}>{children}</button>;
}
export const theme = {
  background: "#0b1017",
  surface: "#101720",
  mint: "#8ce3bd",
  text: "#edf1f6",
} as const;
