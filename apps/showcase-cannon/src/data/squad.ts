import type { SquadGroup } from '../lib/types';

export const SQUAD_GROUPS: SquadGroup[] = [
  {
    group: 'Goalkeepers',
    players: [
      { num: 22, name: 'Raya', full: 'David Raya', nat: 'ESP', pos: 'GK', apps: 35, goals: 0, assists: 0, rating: 7.8, form: ['W', 'W', 'W', 'D', 'W'] },
      { num: 13, name: 'Hein', full: 'Karl Hein', nat: 'EST', pos: 'GK', apps: 3, goals: 0, assists: 0, rating: 6.8, form: ['W', 'W', 'D', 'W', 'W'] },
    ],
  },
  {
    group: 'Defenders',
    players: [
      { num: 12, name: 'Saliba', full: 'William Saliba', nat: 'FRA', pos: 'CB', apps: 36, goals: 2, assists: 2, rating: 8.2, form: ['W', 'W', 'W', 'D', 'W'] },
      { num: 6, name: 'Gabriel', full: 'Gabriel Magalhães', nat: 'BRA', pos: 'CB', apps: 34, goals: 3, assists: 1, rating: 8.0, form: ['W', 'W', 'D', 'W', 'W'] },
      { num: 2, name: 'White', full: 'Ben White', nat: 'ENG', pos: 'RB', apps: 32, goals: 1, assists: 5, rating: 7.8, form: ['W', 'D', 'W', 'W', 'W'] },
      { num: 3, name: 'Zinchenko', full: 'Oleksandr Zinchenko', nat: 'UKR', pos: 'LB', apps: 28, goals: 1, assists: 4, rating: 7.4, form: ['W', 'W', 'W', 'D', 'W'] },
      { num: 18, name: 'Tomiyasu', full: 'Takehiro Tomiyasu', nat: 'JPN', pos: 'RB', apps: 20, goals: 0, assists: 1, rating: 7.2, form: ['W', 'W', 'D', 'W', 'W'] },
    ],
  },
  {
    group: 'Midfielders',
    players: [
      { num: 41, name: 'Rice', full: 'Declan Rice', nat: 'ENG', pos: 'CM', apps: 38, goals: 9, assists: 15, rating: 8.2, form: ['W', 'W', 'D', 'W', 'W'] },
      { num: 8, name: 'Ødegaard', full: 'Martin Ødegaard', nat: 'NOR', pos: 'AM', apps: 36, goals: 14, assists: 22, rating: 8.7, form: ['W', 'W', 'W', 'D', 'W'] },
      { num: 19, name: 'Trossard', full: 'Leandro Trossard', nat: 'BEL', pos: 'AM', apps: 28, goals: 11, assists: 8, rating: 7.6, form: ['W', 'D', 'W', 'W', 'W'] },
      { num: 5, name: 'Merino', full: 'Mikel Merino', nat: 'ESP', pos: 'CM', apps: 25, goals: 4, assists: 6, rating: 7.5, form: ['W', 'W', 'W', 'D', 'W'] },
    ],
  },
  {
    group: 'Forwards',
    players: [
      { num: 7, name: 'Saka', full: 'Bukayo Saka', nat: 'ENG', pos: 'RW', apps: 37, goals: 24, assists: 18, rating: 8.4, form: ['W', 'W', 'D', 'W', 'W'] },
      { num: 11, name: 'Martinelli', full: 'Gabriel Martinelli', nat: 'BRA', pos: 'LW', apps: 34, goals: 21, assists: 11, rating: 7.9, form: ['W', 'D', 'W', 'W', 'W'] },
      { num: 29, name: 'Havertz', full: 'Kai Havertz', nat: 'GER', pos: 'CF', apps: 35, goals: 36, assists: 13, rating: 8.0, form: ['W', 'W', 'W', 'D', 'W'] },
      { num: 9, name: 'Jesus', full: 'Gabriel Jesus', nat: 'BRA', pos: 'CF', apps: 22, goals: 12, assists: 7, rating: 7.3, form: ['W', 'W', 'D', 'W', 'W'] },
    ],
  },
];
