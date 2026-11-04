import "./globals.css";
export const metadata = { title: "StepSignal", description: "Street-level accessibility evidence for pedestrian routes" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
