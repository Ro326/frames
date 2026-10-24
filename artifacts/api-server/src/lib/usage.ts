export const FREE_PROJECT_LIMIT = 5;

export function canCreateProject(pro: boolean, projectsUsed: number): boolean {
  return pro || projectsUsed < FREE_PROJECT_LIMIT;
}
