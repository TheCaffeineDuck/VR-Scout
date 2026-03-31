interface EnvironmentMapProps {
  url: string;
}

/** Loads and applies HDR environment map for lighting */
export function EnvironmentMap({
  url,
}: EnvironmentMapProps): React.JSX.Element {
  return (
    <div className="text-gray-500 text-sm p-2">
      <p>Environment map: {url} (pending integration)</p>
    </div>
  );
}
