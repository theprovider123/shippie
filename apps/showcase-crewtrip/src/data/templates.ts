import type { EventTemplate } from '../types';
import { newId } from '../utils/ids';

export const eventTemplates: EventTemplate[] = [
  {
    id: 'weekend',
    name: 'Weekend Away',
    location: 'Trip HQ',
    description: 'Plans, votes, games, requests, and memories for a weekend crew.',
    hostNote: 'Join the trip, add your name, and help shape the next move.',
    stops: [
      { id: 'tw1', time: 'Now', title: 'Everyone joins', place: 'QR/link check-in', status: 'now' },
      { id: 'tw2', time: 'Next', title: 'First group vote', place: 'Food, drinks, walk, or reset', status: 'next' },
      { id: 'tw3', time: 'Later', title: 'Memory drop', place: 'Photos, videos, quotes, awards', status: 'later' },
    ],
    polls: [
      {
        id: 'tpw1',
        question: 'First group move?',
        closes: 'Open',
        open: true,
        options: ['Food', 'Drinks', 'Walk', 'Rest'].map((label) => ({ id: newId('o'), label, votes: 0 })),
      },
    ],
    challenges: [
      { id: 'tcw1', title: 'Best arrival photo', points: 8, doneBy: [] },
      { id: 'tcw2', title: 'Nominate a group MVP', points: 6, doneBy: [] },
    ],
  },
  {
    id: 'birthday',
    name: 'Birthday Crew',
    location: 'Party HQ',
    description: 'A host-led birthday plan with polls, games, requests, and a memory wall.',
    hostNote: 'Add your name, vote on the next moment, and upload the evidence.',
    stops: [
      { id: 'tb1', time: 'Now', title: 'Guest check-in', place: 'Names, teams, first request', status: 'now' },
      { id: 'tb2', time: 'Next', title: 'Host toast', place: 'One shared moment before chaos', status: 'next' },
      { id: 'tb3', time: 'Later', title: 'Awards', place: 'Best dressed, funniest quote, MVP', status: 'later' },
    ],
    polls: [
      {
        id: 'tpb1',
        question: 'Birthday award category?',
        closes: 'Open',
        open: true,
        options: ['MVP', 'Best dressed', 'Funniest quote'].map((label) => ({ id: newId('o'), label, votes: 0 })),
      },
    ],
    challenges: [
      { id: 'tcb1', title: 'Capture the birthday toast', points: 10, doneBy: [] },
      { id: 'tcb2', title: 'Add a memory for the host', points: 8, doneBy: [] },
    ],
  },
  {
    id: 'festival',
    name: 'Festival Crew',
    location: 'Field HQ',
    description: 'Meet points, set clashes, food votes, crew requests, and proof-of-fun.',
    hostNote: 'Keep the crew together without killing the spontaneity.',
    stops: [
      { id: 'tf1', time: 'Now', title: 'Meet point locked', place: 'Host updates this when plans shift', status: 'now' },
      { id: 'tf2', time: 'Next', title: 'Set clash vote', place: 'Let the crew choose', status: 'next' },
      { id: 'tf3', time: 'Later', title: 'After-hours decision', place: 'Host shares the final call', status: 'later' },
    ],
    polls: [
      {
        id: 'tpf1',
        question: 'Next set?',
        closes: 'Open',
        open: true,
        options: ['Main stage', 'Tent', 'Food first'].map((label) => ({ id: newId('o'), label, votes: 0 })),
      },
    ],
    challenges: [
      { id: 'tcf1', title: 'Best stage photo', points: 10, doneBy: [] },
      { id: 'tcf2', title: 'Find the crew after a split', points: 8, doneBy: [] },
    ],
  },
];
