interface EnvironmentMapProps {
  url: string;
}

/** Loads and applies HDR environment map for lighting */
export function EnvironmentMap({
  url,
}: EnvironmentMapProps): React.JSX.Element {
  // TODO: Implement HDR environment map loading and application
  return (
    <div className="environment-map">
      <p>TODO: Environment map from {url}</p>
    </div>
  );
}
