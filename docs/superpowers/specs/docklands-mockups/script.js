const dockApp = document.querySelector('#dockApp');
const railButtons = Array.from(document.querySelectorAll('[data-mode]'));
const modePill = document.querySelector('#modePill');
const inspectorLabel = document.querySelector('#inspectorLabel');
const inspectorTitle = document.querySelector('#inspectorTitle');
const inspectorCopy = document.querySelector('#inspectorCopy');
const inspectorMeter = document.querySelector('#inspectorMeter');
const primaryAction = document.querySelector('#primaryAction');
const secondaryAction = document.querySelector('#secondaryAction');
const trustNote = document.querySelector('#trustNote');

const modeState = {
  day: {
    pill: 'Day room',
    label: 'Room heart',
    title: 'Beacon Core',
    copy: 'Comfort, route safety, guest stamps, and replay receipts all live around this light.',
    meter: '91%',
    primary: 'Tune room',
    secondary: 'Crew',
    trust: 'Local room state. Nothing leaves this device.',
  },
  build: {
    pill: 'Build mode',
    label: 'Placement',
    title: 'Crate Wall',
    copy: 'Drag the wall to bend the tide route. The path stays open and replay-safe.',
    meter: '88%',
    primary: 'Place',
    secondary: 'Rotate',
    trust: 'Local edit only. Nothing leaves this device.',
  },
  tide: {
    pill: 'Tide mode',
    label: 'Selected',
    title: 'Bell Turret',
    copy: 'Level 2. The cozy bell opens into a Tide defense when the route lights up.',
    meter: '64%',
    primary: 'Upgrade',
    secondary: 'Move',
    trust: 'Trust: last share logged locally.',
  },
  open: {
    pill: 'Live room',
    label: 'Open dock',
    title: 'BEACON-482',
    copy: 'Three guests can join by QR. Emote chat only. Host validates co-op commands.',
    meter: '72%',
    primary: 'Copy code',
    secondary: 'Revoke',
    trust: 'Live room uses edge rendezvous. Payload stays minimal.',
  },
  share: {
    pill: 'Share mode',
    label: 'Capsule',
    title: 'Beat my tide',
    copy: 'Exports a playable room snapshot and wave seed. Friend returns a replay receipt.',
    meter: '94%',
    primary: 'Create',
    secondary: 'Preview',
    trust: 'Share export creates a redacted ledger row.',
  },
};

function setMode(mode) {
  const state = modeState[mode] ?? modeState.tide;
  dockApp.className = `app-frame desktop-frame mode-${mode}`;
  modePill.textContent = state.pill;
  inspectorLabel.textContent = state.label;
  inspectorTitle.textContent = state.title;
  inspectorCopy.textContent = state.copy;
  inspectorMeter.style.setProperty('--w', state.meter);
  primaryAction.textContent = state.primary;
  secondaryAction.textContent = state.secondary;
  trustNote.textContent = state.trust;
  railButtons.forEach((button) => {
    button.classList.toggle('rail-active', button.dataset.mode === mode);
  });
}

railButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

const captainAvatar = document.querySelector('#captainAvatar');
const captainName = document.querySelector('#captainName');
const captainTrait = document.querySelector('#captainTrait');
const nameInput = document.querySelector('#nameInput');
const bodyLayer = document.querySelector('.avatar-body');
const headLayer = document.querySelector('.avatar-head');
const hairLayer = document.querySelector('.avatar-hair');
const jacketLayer = document.querySelector('.avatar-jacket');

function updateCaptainTrait() {
  const stance = captainAvatar.dataset.stance || 'brisk';
  const outfit = captainAvatar.dataset.outfit || 'builder';
  captainTrait.textContent = `${stance} ${outfit}`;
}

nameInput?.addEventListener('input', () => {
  captainName.textContent = nameInput.value.trim() || 'Captain';
});

document.querySelectorAll('.swatch-row button').forEach((button) => {
  button.addEventListener('click', () => {
    const row = button.closest('.swatch-row');
    row.querySelectorAll('button').forEach((peer) => peer.classList.remove('selected'));
    button.classList.add('selected');
    if (row.dataset.target === 'skin') {
      bodyLayer.style.background = button.dataset.value;
      headLayer.style.background = button.dataset.value;
    }
    if (row.dataset.target === 'hair') {
      hairLayer.style.background = button.dataset.value;
    }
  });
});

document.querySelectorAll('.creator-segment button').forEach((button) => {
  button.addEventListener('click', () => {
    const group = button.closest('.creator-segment');
    group.querySelectorAll('button').forEach((peer) => peer.classList.remove('selected'));
    button.classList.add('selected');
    if (group.dataset.target === 'outfit') {
      captainAvatar.dataset.outfit = button.dataset.value;
      const colors = {
        builder: '#1f6562',
        host: '#d9603a',
        tide: '#67507f',
      };
      jacketLayer.style.background = colors[button.dataset.value] ?? colors.builder;
      updateCaptainTrait();
    }
    if (group.dataset.target === 'stance') {
      captainAvatar.dataset.stance = button.dataset.value;
      updateCaptainTrait();
    }
  });
});

document.querySelectorAll('[data-emote]').forEach((button) => {
  button.addEventListener('click', () => {
    captainAvatar.dataset.emote = button.dataset.emote;
    captainAvatar.classList.remove('emote-wave', 'emote-cheer', 'emote-repair');
    void captainAvatar.offsetWidth;
    captainAvatar.classList.add(`emote-${button.dataset.emote}`);
  });
});

setMode('tide');
