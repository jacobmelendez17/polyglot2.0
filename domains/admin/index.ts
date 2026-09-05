/**
 * Client-safe public surface for `domains/admin`: pure, database-free
 * authorization predicates only. Future DB/secret-touching orchestration
 * (audit, publication, sandbox — spec 11 §76) belongs in a
 * `server.ts` entry point instead, added when Unit 2 introduces the first
 * one — see `domains/lessons/server.ts` for why the split exists.
 */
export { canAccessAdminArea, canManageCurriculum } from "./authorization";
