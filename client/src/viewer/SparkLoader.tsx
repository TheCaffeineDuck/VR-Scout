interface SparkLoaderProps {
  url: string;
  onProgress?: (loaded: number, total: number) => void;
}

/** Loads and initializes Spark gaussian splat data from SPZ URL */
export function SparkLoader({
  url,
  onProgress: _onProgress,
}: SparkLoaderProps): React.JSX.Element {
  // TODO: Implement Spark SPZ loading with progress tracking
  return (
    <div className="spark-loader">
      <p>TODO: Loading splat from {url}</p>
    </div>
  );
}
