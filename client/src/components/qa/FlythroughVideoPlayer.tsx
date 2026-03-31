interface FlythroughVideoPlayerProps {
  url?: string;
}

/** Embedded video player for flythrough preview */
export function FlythroughVideoPlayer({ url }: FlythroughVideoPlayerProps): React.JSX.Element {
  if (!url) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Flythrough Video
        </h3>
        <p className="text-sm text-gray-500">No flythrough video available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Flythrough Video
      </h3>
      <video
        src={url}
        controls
        className="w-full rounded-lg"
        playsInline
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
