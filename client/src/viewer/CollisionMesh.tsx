interface CollisionMeshProps {
  url: string;
}

/** Loads and renders collision mesh overlay */
export function CollisionMesh({ url }: CollisionMeshProps): React.JSX.Element {
  return (
    <div className="text-gray-500 text-sm p-2">
      <p>Collision mesh: {url} (pending integration)</p>
    </div>
  );
}
