interface SparkLoaderProps {
  url: string;
  onProgress?: (loaded: number, total: number) => void;
}

/** Loads and initializes Spark gaussian splat data from SPZ URL */
export function SparkLoader({
  url,
  onProgress: _onProgress,
}: SparkLoaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-center p-4 text-gray-500 text-sm">
      <p>Spark SPZ loader: {url} (pending integration)</p>
    </div>
  );
}
