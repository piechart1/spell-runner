// server/src/blocklist.js
// Initials that the world scores refuse (docs/LEADERBOARD.md, section 7).
//
// Three uppercase letters each, in alphabetical order. The list holds combinations that are rude or
// hateful, or that are commonly typed onto a public score board to taunt or shock. Some of them are
// ordinary words or could be somebody's real initials; they are here only because of how they get
// used on a board that children read. A player whose initials are refused is asked for others.
//
// This file is the one place the list is kept. js/board.js carries a copy and a test checks that the
// two are equal, so change both together.

export const BLOCKLIST = [
  'ABO', 'ANL', 'ANS', 'ANU', 'ARS', 'ASS', 'AZZ',
  'BBS', 'BCH', 'BJS', 'BNR', 'BTT', 'BUM',
  'CHK', 'CLT', 'CNT', 'COC', 'COK', 'COX', 'CUK', 'CUM', 'CUN',
  'DCK', 'DIC', 'DIE', 'DIK', 'DIQ', 'DIX', 'DTF', 'DYK',
  'FAG', 'FAP', 'FCK', 'FFS', 'FGT', 'FKK', 'FKN', 'FKR', 'FKU', 'FUC', 'FUK', 'FUQ', 'FUX', 'FVK', 'FXK',
  'GAY', 'GFY', 'GOK', 'GTF', 'GUK', 'GYP',
  'HMO', 'HOE', 'HOM', 'HOR', 'HRN', 'HTL',
  'JAP', 'JEW', 'JIZ', 'JZZ',
  'KIK', 'KIL', 'KKK', 'KLN', 'KMS', 'KNB', 'KNT', 'KOK', 'KOX', 'KUK', 'KUM', 'KYK', 'KYS',
  'LEZ',
  'MFK', 'MFR', 'MLF', 'MNG',
  'NAZ', 'NGA', 'NGG', 'NGR', 'NIG', 'NIP', 'NOB', 'NUD', 'NYG', 'NZI',
  'PAK', 'PDO', 'PED', 'PEE', 'PHK', 'PHU', 'PIS', 'PKI', 'PNS', 'POF', 'POO', 'PRK', 'PRN', 'PSS', 'PSY', 'PUS',
  'QER',
  'RPE', 'RTD',
  'SEX', 'SHI', 'SHT', 'SLG', 'SLT', 'SLU', 'SPC', 'SPK', 'SPM', 'SPZ', 'STF', 'SUC', 'SUK', 'SUX', 'SXY',
  'THT', 'TIT', 'TRD', 'TRN', 'TTS', 'TWA', 'TWT',
  'VAG', 'VAJ',
  'WAN', 'WHR', 'WNK', 'WOG', 'WOP', 'WTF',
  'XXX',
  'YID'
];

export default BLOCKLIST;
