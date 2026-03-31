interface CollisionMeshProps {
  url: string;
}

/** Loads and renders collision mesh overlay */
export function CollisionMesh({ url }: CollisionMeshProps): React.JSX.Element {
  // TODO: Implement collision mesh loading and wireframe rendering
  return (
    <div className="collision-mesh">
      <p>TODO: Collision mesh from {url}</p>
    </div>
  );
}
