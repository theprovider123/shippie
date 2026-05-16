export type Locale = 'en-GB' | 'en-US' | 'es' | 'fr' | 'pt' | 'de';

export type Copy = {
  appName: string;
  startEyebrow: string;
  startHeadline: string;
  startSupport: string;
  startAction: string;
  languageLabel: string;
  timeZoneLabel: string;
  templatesLabel: string;
  templateFriends: string;
  templatePub: string;
  templateFamily: string;
  templateOffice: string;
  templateHardcore: string;
  templateWatchParty: string;
  joinLabel: string;
  joinButton: string;
  joinPlaceholder: string;
  joinInvalid: string;
  joinMissing: string;
  hostEyebrow: string;
  hostTitle: string;
  openPoll: string;
  question: string;
  choices: string;
  guestQr: string;
  screenFeed: string;
  liveTallies: string;
  shoutouts: string;
  noPolls: string;
  queueClear: string;
  guestEyebrow: string;
  guestTitle: string;
  waitingMoment: string;
  displayEyebrow: string;
  displayWaiting: string;
  leadingNow: string;
  scorePicks: string;
  standBy: string;
  displayNoScore: string;
  fanShoutout: string;
  approvedMessages: string;
  programmeTitle: string;
  localKickoff: string;
  hostKickoff: string;
  cityGuide: string;
  venueGuide: string;
  connectedPeers: (count: number) => string;
  nearbyPeers: (count: number) => string;
  linkedPeers: (count: number) => string;
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-GB': 'English UK',
  'en-US': 'English US',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  de: 'Deutsch',
};

export const DEFAULT_LOCALE: Locale = 'en-GB';

const copy: Record<Locale, Copy> = {
  'en-GB': {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Your private room for the 2026 football tournament.',
    startSupport: 'Predictions, trivia, sweepstakes, votes, fixtures, and matchday banter. No account. No ads.',
    startAction: 'Start room',
    languageLabel: 'Language',
    timeZoneLabel: 'Local region',
    templatesLabel: 'Room type',
    templateFriends: 'Friends',
    templatePub: 'Pub',
    templateFamily: 'Family',
    templateOffice: 'Office',
    templateHardcore: 'Hardcore',
    templateWatchParty: 'Watch Party',
    joinLabel: 'Guest link',
    joinButton: 'Join',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Paste a Match Room link.',
    joinMissing: 'Paste the full guest link from the host board.',
    hostEyebrow: 'Host board',
    hostTitle: 'Host room',
    openPoll: 'Open a poll',
    question: 'Question',
    choices: 'Choices',
    guestQr: 'Guest QR',
    screenFeed: 'Screen feed',
    liveTallies: 'Room results',
    shoutouts: 'Room shouts',
    noPolls: 'No moment open yet.',
    queueClear: 'Queue clear.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Play room',
    waitingMoment: 'Waiting for the next match moment.',
    displayEyebrow: 'Match Room live',
    displayWaiting: 'Waiting for the next vote',
    leadingNow: 'Leading now',
    scorePicks: 'Score picks',
    standBy: 'Stand by',
    displayNoScore: 'Host will open the next moment',
    fanShoutout: 'Room shout',
    approvedMessages: 'Approved messages will appear here.',
    programmeTitle: 'Match guide',
    localKickoff: 'Your kickoff',
    hostKickoff: 'Host-city kickoff',
    cityGuide: 'City guide',
    venueGuide: 'Venue note',
    connectedPeers: (count) => `${count} peers`,
    nearbyPeers: (count) => `${count} nearby`,
    linkedPeers: (count) => `${count} linked`,
  },
  'en-US': {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Your private room for the 2026 soccer tournament.',
    startSupport: 'Predictions, trivia, sweepstakes, votes, fixtures, and matchday banter. No account. No ads.',
    startAction: 'Start room',
    languageLabel: 'Language',
    timeZoneLabel: 'Local region',
    templatesLabel: 'Room type',
    templateFriends: 'Friends',
    templatePub: 'Bar',
    templateFamily: 'Family',
    templateOffice: 'Office',
    templateHardcore: 'Hardcore',
    templateWatchParty: 'Watch Party',
    joinLabel: 'Guest link',
    joinButton: 'Join',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Paste a Match Room link.',
    joinMissing: 'Paste the full guest link from the host board.',
    hostEyebrow: 'Host board',
    hostTitle: 'Host room',
    openPoll: 'Open a poll',
    question: 'Question',
    choices: 'Choices',
    guestQr: 'Guest QR',
    screenFeed: 'Screen feed',
    liveTallies: 'Room results',
    shoutouts: 'Room shouts',
    noPolls: 'No moment open yet.',
    queueClear: 'Queue clear.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Play room',
    waitingMoment: 'Waiting for the next match moment.',
    displayEyebrow: 'Match Room live',
    displayWaiting: 'Waiting for the next vote',
    leadingNow: 'Leading now',
    scorePicks: 'Score picks',
    standBy: 'Stand by',
    displayNoScore: 'Host will open the next moment',
    fanShoutout: 'Room shout',
    approvedMessages: 'Approved messages will appear here.',
    programmeTitle: 'Match guide',
    localKickoff: 'Your kickoff',
    hostKickoff: 'Host-city kickoff',
    cityGuide: 'City guide',
    venueGuide: 'Venue note',
    connectedPeers: (count) => `${count} peers`,
    nearbyPeers: (count) => `${count} nearby`,
    linkedPeers: (count) => `${count} linked`,
  },
  es: {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Tu sala privada para el torneo de fútbol de 2026.',
    startSupport: 'Pronósticos, trivia, sorteos, votos, partidos y charla. Sin cuenta. Sin anuncios.',
    startAction: 'Crear sala',
    languageLabel: 'Idioma',
    timeZoneLabel: 'Región local',
    templatesLabel: 'Tipo de sala',
    templateFriends: 'Amistades',
    templatePub: 'Bar',
    templateFamily: 'Familia',
    templateOffice: 'Oficina',
    templateHardcore: 'Expertos',
    templateWatchParty: 'Ver juntos',
    joinLabel: 'Enlace de invitado',
    joinButton: 'Entrar',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Pega un enlace de Match Room.',
    joinMissing: 'Pega el enlace completo del tablero anfitrión.',
    hostEyebrow: 'Anfitrión',
    hostTitle: 'Sala anfitriona',
    openPoll: 'Abrir encuesta',
    question: 'Pregunta',
    choices: 'Opciones',
    guestQr: 'QR de invitados',
    screenFeed: 'Pantalla',
    liveTallies: 'Resultados en vivo',
    shoutouts: 'Mensajes',
    noPolls: 'Aún no hay momento abierto.',
    queueClear: 'Cola limpia.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Jugar en la sala',
    waitingMoment: 'Esperando el próximo momento del partido.',
    displayEyebrow: 'Match Room en vivo',
    displayWaiting: 'Esperando la próxima votación',
    leadingNow: 'Va ganando',
    scorePicks: 'Marcadores',
    standBy: 'Espera',
    displayNoScore: 'El anfitrión abrirá el próximo momento',
    fanShoutout: 'Mensaje de la sala',
    approvedMessages: 'Los mensajes aprobados aparecerán aquí.',
    programmeTitle: 'Guía del partido',
    localKickoff: 'Tu horario',
    hostKickoff: 'Horario de la sede',
    cityGuide: 'Guía de ciudad',
    venueGuide: 'Nota del estadio',
    connectedPeers: (count) => `${count} conectados`,
    nearbyPeers: (count) => `${count} cerca`,
    linkedPeers: (count) => `${count} enlazados`,
  },
  fr: {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Votre salon privé pour le tournoi de football 2026.',
    startSupport: 'Pronostics, quiz, tirages, votes, calendrier et chambrage. Sans compte. Sans pub.',
    startAction: 'Créer un salon',
    languageLabel: 'Langue',
    timeZoneLabel: 'Région locale',
    templatesLabel: 'Type de salon',
    templateFriends: 'Amis',
    templatePub: 'Pub',
    templateFamily: 'Famille',
    templateOffice: 'Bureau',
    templateHardcore: 'Experts',
    templateWatchParty: 'Soirée match',
    joinLabel: 'Lien invité',
    joinButton: 'Rejoindre',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Collez un lien Match Room.',
    joinMissing: 'Collez le lien invité complet du tableau hôte.',
    hostEyebrow: 'Hôte',
    hostTitle: 'Salon hôte',
    openPoll: 'Lancer un vote',
    question: 'Question',
    choices: 'Choix',
    guestQr: 'QR invité',
    screenFeed: 'Écran',
    liveTallies: 'Votes en direct',
    shoutouts: 'Messages',
    noPolls: 'Aucun moment ouvert.',
    queueClear: 'File vide.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Jouer dans le salon',
    waitingMoment: 'En attente du prochain moment du match.',
    displayEyebrow: 'Match Room en direct',
    displayWaiting: 'En attente du prochain vote',
    leadingNow: 'En tête',
    scorePicks: 'Scores',
    standBy: 'Patientez',
    displayNoScore: "L'hôte ouvrira le prochain moment",
    fanShoutout: 'Message du salon',
    approvedMessages: 'Les messages approuvés apparaîtront ici.',
    programmeTitle: 'Guide du match',
    localKickoff: 'Votre coup d’envoi',
    hostKickoff: 'Coup d’envoi local',
    cityGuide: 'Guide de la ville',
    venueGuide: 'Note du stade',
    connectedPeers: (count) => `${count} connectés`,
    nearbyPeers: (count) => `${count} proches`,
    linkedPeers: (count) => `${count} liés`,
  },
  pt: {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Sua sala privada para o torneio de futebol de 2026.',
    startSupport: 'Palpites, trivia, sorteios, votações, jogos e resenha. Sem conta. Sem anúncios.',
    startAction: 'Criar sala',
    languageLabel: 'Idioma',
    timeZoneLabel: 'Região local',
    templatesLabel: 'Tipo de sala',
    templateFriends: 'Amigos',
    templatePub: 'Bar',
    templateFamily: 'Família',
    templateOffice: 'Escritório',
    templateHardcore: 'Fanáticos',
    templateWatchParty: 'Assistir juntos',
    joinLabel: 'Link de convidado',
    joinButton: 'Entrar',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Cole um link do Match Room.',
    joinMissing: 'Cole o link completo do painel do anfitrião.',
    hostEyebrow: 'Anfitrião',
    hostTitle: 'Sala anfitriã',
    openPoll: 'Abrir votação',
    question: 'Pergunta',
    choices: 'Opções',
    guestQr: 'QR de convidados',
    screenFeed: 'Tela',
    liveTallies: 'Parciais ao vivo',
    shoutouts: 'Mensagens',
    noPolls: 'Nenhum momento aberto ainda.',
    queueClear: 'Fila limpa.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Jogar na sala',
    waitingMoment: 'Esperando o próximo momento do jogo.',
    displayEyebrow: 'Match Room ao vivo',
    displayWaiting: 'Esperando a próxima votação',
    leadingNow: 'Na frente',
    scorePicks: 'Placar',
    standBy: 'Aguarde',
    displayNoScore: 'O anfitrião abrirá o próximo momento',
    fanShoutout: 'Mensagem da sala',
    approvedMessages: 'Mensagens aprovadas aparecerão aqui.',
    programmeTitle: 'Guia do jogo',
    localKickoff: 'Seu horário',
    hostKickoff: 'Horário da sede',
    cityGuide: 'Guia da cidade',
    venueGuide: 'Nota do estádio',
    connectedPeers: (count) => `${count} conectados`,
    nearbyPeers: (count) => `${count} próximos`,
    linkedPeers: (count) => `${count} vinculados`,
  },
  de: {
    appName: 'Shippie Match Room',
    startEyebrow: 'Shippie Match Room',
    startHeadline: 'Dein privater Raum für das Fußballturnier 2026.',
    startSupport: 'Tipps, Quiz, Auslosung, Abstimmungen, Spielplan und Matchday-Sprüche. Kein Konto. Keine Werbung.',
    startAction: 'Raum starten',
    languageLabel: 'Sprache',
    timeZoneLabel: 'Lokale Region',
    templatesLabel: 'Raumtyp',
    templateFriends: 'Freunde',
    templatePub: 'Kneipe',
    templateFamily: 'Familie',
    templateOffice: 'Büro',
    templateHardcore: 'Experten',
    templateWatchParty: 'Watch Party',
    joinLabel: 'Gastlink',
    joinButton: 'Beitreten',
    joinPlaceholder: 'https://shippie.app/run/match-room/?role=play...',
    joinInvalid: 'Füge einen Match-Room-Link ein.',
    joinMissing: 'Füge den vollständigen Gastlink vom Host-Board ein.',
    hostEyebrow: 'Host',
    hostTitle: 'Raum hosten',
    openPoll: 'Abstimmung öffnen',
    question: 'Frage',
    choices: 'Optionen',
    guestQr: 'Gast-QR',
    screenFeed: 'Bildschirm',
    liveTallies: 'Live-Stände',
    shoutouts: 'Raumrufe',
    noPolls: 'Noch kein Moment geöffnet.',
    queueClear: 'Warteschlange leer.',
    guestEyebrow: 'Match Room',
    guestTitle: 'Raum spielen',
    waitingMoment: 'Warten auf den nächsten Spielmoment.',
    displayEyebrow: 'Match Room live',
    displayWaiting: 'Warten auf die nächste Abstimmung',
    leadingNow: 'Führt gerade',
    scorePicks: 'Ergebnistipps',
    standBy: 'Bereit halten',
    displayNoScore: 'Der Host öffnet den nächsten Moment',
    fanShoutout: 'Raumruf',
    approvedMessages: 'Freigegebene Nachrichten erscheinen hier.',
    programmeTitle: 'Spielguide',
    localKickoff: 'Deine Anstoßzeit',
    hostKickoff: 'Anstoßzeit vor Ort',
    cityGuide: 'Stadtguide',
    venueGuide: 'Stadionnotiz',
    connectedPeers: (count) => `${count} verbunden`,
    nearbyPeers: (count) => `${count} in der Nähe`,
    linkedPeers: (count) => `${count} gekoppelt`,
  },
};

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  for (const raw of navigator.languages ?? [navigator.language]) {
    const locale = normaliseLocale(raw);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function normaliseLocale(value: string | undefined): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'en-us') return 'en-US';
  if (lower.startsWith('en')) return 'en-GB';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('de')) return 'de';
  return null;
}

export function copyFor(locale: Locale): Copy {
  return copy[locale] ?? copy[DEFAULT_LOCALE];
}
