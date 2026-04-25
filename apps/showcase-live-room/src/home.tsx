interface HomeProps {
  onPickHost: () => void;
  onPickGuest: () => void;
}

export function Home({ onPickHost, onPickGuest }: HomeProps) {
  return (
    <main className="home">
      <h1>Live Room</h1>
      <p>Local quiz for the room you&rsquo;re in.</p>
      <button type="button" className="primary" onClick={onPickHost}>
        Host a room
      </button>
      <button type="button" onClick={onPickGuest}>
        Join a room
      </button>
    </main>
  );
}
