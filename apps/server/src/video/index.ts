import type { AppConfig } from "../config";
import { VideoArtifactStore } from "./artifactStore";
import { VideoWorkflowCoordinator, startVideoWorkflowScheduler } from "./coordinator";
import { HermesVideoAgentAdapter } from "./hermesAgent";
import { VideoRepository } from "./repository";
import { createVideoRoutes } from "./routes";

export function createVideoModule(config: AppConfig) {
  const repository = new VideoRepository(config);
  const artifacts = new VideoArtifactStore(config, repository);
  const agent = new HermesVideoAgentAdapter(config);
  const coordinator = new VideoWorkflowCoordinator({ repository, artifacts, agent });
  const router = createVideoRoutes(coordinator);
  const stopScheduler = config.videoWorkflowScheduler
    ? startVideoWorkflowScheduler(coordinator, {
        onError(error) {
          console.error("[video-agent] scheduler tick failed", error);
        },
      })
    : () => {};
  let stopped = false;

  return {
    router,
    coordinator,
    stop() {
      if (stopped) return;
      stopped = true;
      stopScheduler();
      repository.close();
    },
  };
}

export { VideoWorkflowCoordinator } from "./coordinator";
export { VideoRepository } from "./repository";
