import { z } from "zod";

export const auditRequestSchema = z.object({
  url: z.string().url(),
});

export type AuditRequest = z.infer<typeof auditRequestSchema>;
