import { generateProjectDiffActions } from '../../../src/scripts/sync/generate-projects-diff-actions';
import type { SnykProject } from '../../../src/lib/types';

describe('generateProjectDiffActions', () => {
  it('identifies correctly the diff between files in the repo vs monitored in Snyk', async () => {
    // Arrange
    const projects: SnykProject[] = [
      {
        name: 'snyk/goof:todo/package.json',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'npm',
        branch: 'master',
      },
      {
        name: 'snyk/goof:src/Dockerfile',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'npm',
        branch: 'master',
      },
    ];
    // Act
    const res = await generateProjectDiffActions(
      ['package.json', 'path/to/build.gradle', 'src/Dockerfile'],
      projects,
    );

    // Assert
    expect(res).toStrictEqual({
      import: ['package.json', 'path/to/build.gradle'],
      deactivate: [
        {
          name: 'snyk/goof:todo/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        },
      ],
    });
  });
  it('no changes needed', async () => {
    // Arrange
    const projects: SnykProject[] = [
      {
        name: 'snyk/goof:package.json',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'npm',
        branch: 'master',
      },
    ];
    // Act
    const res = await generateProjectDiffActions(['package.json'], projects);

    // Assert
    expect(res).toStrictEqual({
      import: [],
      deactivate: [],
    });
  });
});
