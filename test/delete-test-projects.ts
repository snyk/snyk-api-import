import { deleteProjects } from "../src/lib";
import type { Project } from '../src/lib/types';

export async function deleteTestProjects(
  orgId: string,
  discoveredProjects: Project[],
): Promise<void> {
  const projectIds: string[] = [];
  discoveredProjects.forEach(async (project) => {
    if (project.projectUrl) {
      const projectId = project.projectUrl.split('/').slice(-1)[0];
      projectIds.push(projectId);
    }
  });
  if (projectIds.length > 0) {
    await deleteProjects(orgId, projectIds);
  }
}
