import { generateProjectDiffActions } from '../../../src/scripts/sync/generate-projects-diff-actions';
import type { SnykProject } from '../../../src/lib/types';
import {
  DOCKER,
  OPEN_SOURCE_PACKAGE_MANAGERS,
} from '../../../src/lib/supported-project-types/supported-manifests';

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
        type: 'dockerfile',
        branch: 'master',
      },
    ];
    // Act
    const res = await generateProjectDiffActions(
      ['package.json', 'path/to/build.gradle', 'src/Dockerfile'],
      projects,
      [...Object.keys(OPEN_SOURCE_PACKAGE_MANAGERS), ...Object.keys(DOCKER)],
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

  it('ignores non Open Source projects like Docker', async () => {
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
      {
        name: 'snyk/goof:Dockerfile',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'dockerfile',
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
  it('compares Open Source + Docker projects', async () => {
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
      {
        name: 'snyk/goof:Dockerfile',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'dockerfile',
        branch: 'master',
      },
    ];
    // Act
    const res = await generateProjectDiffActions(['package.json'], projects, [
      ...Object.keys(OPEN_SOURCE_PACKAGE_MANAGERS),
      ...Object.keys(DOCKER),
    ]);

    // Assert
    expect(res).toStrictEqual({
      import: [],
      deactivate: [
        {
          name: 'snyk/goof:Dockerfile',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'dockerfile',
          branch: 'master',
        },
      ],
    });
  });
});
