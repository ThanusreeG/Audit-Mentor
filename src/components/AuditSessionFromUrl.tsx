"use client";

import { useSearchParams } from "next/navigation";
import AuditSessionClient from "./AuditSessionClient";

export default function AuditSessionFromUrl() {
  const searchParams = useSearchParams();
  return <AuditSessionClient sessionId={searchParams.get("sessionId")} />;
}
