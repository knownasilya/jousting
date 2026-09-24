// The tournament: five champions in rising order of skill. Beat each in turn to win the laurels.
// A lost bout can be ridden again (the herald allows a knight three defeats before he is sent home).

export const OPPONENTS = [
	{
		id: 'aldric', slot: 1, name: 'Sir Aldric', title: 'the Green', skill: 0.2,
		horse: 'courser', armour: 'russet', helm: 'barbute', plume: 'green', skin: 0, hair: 3, beard: 1,
		arms: { division: 'plain', field: [ 'vert', 'argent' ], charge: 'boar', chargeTincture: 'argent' },
		intro: 'A hedge knight of the western marches, young and eager to prove himself.',
		taunt: 'My mother made this surcoat. Mind you do not tear it!',
		defeated: 'Well struck! I shall tell the tale in every tavern home.',
	},
	{
		id: 'isolde', slot: 2, name: 'Dame Isolde', title: 'of Ravensmoor', skill: 0.4,
		horse: 'andalusian', armour: 'steel', helm: 'armet', plume: 'black', skin: 0, hair: 0, beard: 0,
		arms: { division: 'perBend', field: [ 'argent', 'sable' ], charge: 'eagle', chargeTincture: 'gules' },
		intro: 'Keeper of the northern fells. She has never lost a pass on her own ground.',
		taunt: 'I have unhorsed better knights than you before breakfast.',
		defeated: 'The ravens will speak your name this night.',
	},
	{
		id: 'bertrand', slot: 3, name: 'Sir Bertrand', title: 'le Rouge', skill: 0.58,
		horse: 'chestnut', armour: 'gilded', helm: 'frogmouth', plume: 'red', skin: 1, hair: 2, beard: 3,
		arms: { division: 'chevron', field: [ 'gules', 'or' ], charge: 'none', chargeTincture: 'or' },
		intro: 'A champion of the southern courts, fond of gold and fonder of glory.',
		taunt: 'Gold armour, red blood. Yours, I expect.',
		defeated: 'Mon dieu. You have spoiled my gilding.',
	},
	{
		id: 'ashfell', slot: 4, name: 'The Black Knight', title: 'of Ashfell', skill: 0.76,
		horse: 'destrier', armour: 'blackened', helm: 'hounskull', plume: 'black', skin: 3, hair: 0, beard: 2,
		arms: { division: 'plain', field: [ 'sable', 'argent' ], charge: 'tower', chargeTincture: 'argent' },
		intro: 'No one knows his true name. He rides in silence and leaves the lists in silence.',
		taunt: '…',
		defeated: 'He bows once, and rides away without a word.',
	},
	{
		id: 'godfrey', slot: 5, name: 'Sir Godfrey', title: 'the Unbroken, King\'s Champion', skill: 0.92,
		horse: 'percheron', armour: 'azure', helm: 'greathelm', plume: 'gold', skin: 1, hair: 4, beard: 2,
		arms: { division: 'quarterly', field: [ 'azure', 'or' ], charge: 'crown', chargeTincture: 'gules' },
		intro: 'Twenty years the King\'s Champion. No knight living has knocked him from the saddle.',
		taunt: 'Ride well, young one. The crowd deserves a good fall.',
		defeated: 'Then I am broken at last. Take the laurels, Champion. You have earned them.',
	},
];

// the arms flown for the King in the royal box (atlas slot 7)
export const ROYAL_ARMS = { division: 'plain', field: [ 'purpure', 'or' ], charge: 'crown', chargeTincture: 'or' };

export const ROUND_NAMES = [ 'First Bout', 'Second Bout', 'Third Bout', 'Semi-final', 'Grand Final' ];
export const MAX_DEFEATS = 3;

export class Tournament {

	constructor() {

		this.round = 0;
		this.defeats = 0;
		this.results = []; // { opponent, won, score: [ you, them ], unhorsed }

	}

	get opponent() {

		return OPPONENTS[ this.round ];

	}

	get roundName() {

		return ROUND_NAMES[ this.round ];

	}

	get finished() {

		return this.round >= OPPONENTS.length;

	}

	get eliminated() {

		return this.defeats >= MAX_DEFEATS;

	}

	// record a bout; returns 'next' | 'champion' | 'retry' | 'eliminated'
	record( result ) {

		this.results.push( { opponent: this.opponent.id, ...result } );
		if ( result.won ) {

			this.round ++;
			return this.finished ? 'champion' : 'next';

		}

		this.defeats ++;
		return this.eliminated ? 'eliminated' : 'retry';

	}

}
