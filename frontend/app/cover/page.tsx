import { redirect } from "next/navigation";
export default function Cover() { redirect(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`); }
