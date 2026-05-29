import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StoreProvider } from "./state";
import "./styles.css";

// Standalone boot — golazo declares `lifecycle: "manual"` in shippie.json,
// so it owns its own mount. No Shippie iframe SDK is needed: the app is
// fully self-contained (localStorage + BroadcastChannel), and the container
// marks the frame ready on the iframe's native load event.
const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
}
