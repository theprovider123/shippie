interface StemProps {
  thingsCount: number; // 0-4
  allDone: boolean;
}

export function Stem({ thingsCount, allDone }: StemProps) {
  // Leaves appear as thingsCount increases
  const leaves = [
    { side: 'right', visible: thingsCount >= 1 },
    { side: 'left', visible: thingsCount >= 2 },
    { side: 'right', visible: thingsCount >= 3 },
    { side: 'left', visible: thingsCount >= 4 },
  ];

  return (
    <div className="chiwit-stem" aria-hidden="true">
      <div className="chiwit-stem__stalk">
        {leaves.map((leaf, i) =>
          leaf.visible ? (
            <div
              key={i}
              className={`chiwit-stem__leaf chiwit-stem__leaf--${leaf.side}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ) : null
        )}
      </div>
      {allDone && (
        <div className="chiwit-stem__bloom">
          <img
            src="/brand/chiwit-lotus.png"
            alt="lotus bloom"
            className="chiwit-stem__lotus"
          />
        </div>
      )}
    </div>
  );
}
