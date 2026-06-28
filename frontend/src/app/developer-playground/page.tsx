import DeveloperPlayground from "@/pages/DeveloperPlayground";
import { notFound } from "next/navigation";

export default function DeveloperPlaygroundPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <DeveloperPlayground />;
}
