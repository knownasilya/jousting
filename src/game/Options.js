// Everything a knight can choose: horse, armour, helm, plume and looks. Stats are 0..1 and feed
// the joust (see Joust.js); looks are colours for the model (see world/Knight.js).

export const HORSES = {
	destrier: {
		name: 'Thunder', breed: 'Black destrier', blurb: 'A great warhorse. Slow to start, but he hits like a falling tower.',
		coat: 0x1c1714, mane: 0x0c0a09, socks: false, blaze: false,
		stats: { speed: 0.72, accel: 0.55, power: 1.0, steady: 0.9 },
	},
	courser: {
		name: 'Swiftwind', breed: 'Bay courser', blurb: 'Light and fast. You will reach the tilt first, but ride with care.',
		coat: 0x5c2e17, mane: 0x120c09, socks: false, points: true, blaze: true,
		stats: { speed: 1.0, accel: 0.95, power: 0.68, steady: 0.55 },
	},
	andalusian: {
		name: 'Perla', breed: 'Grey Andalusian', blurb: 'Proud and even-gaited. A steady seat for a careful lance.',
		coat: 0xcdc8be, mane: 0xe2ddd2, socks: false, blaze: false,
		stats: { speed: 0.82, accel: 0.8, power: 0.78, steady: 1.0 },
	},
	chestnut: {
		name: 'Ember', breed: 'Chestnut rouncey', blurb: 'Quick off the mark and eager. A good all-round mount.',
		coat: 0x87451f, mane: 0xa8743e, socks: true, blaze: true,
		stats: { speed: 0.86, accel: 1.0, power: 0.8, steady: 0.72 },
	},
	percheron: {
		name: 'Goliath', breed: 'Dapple-grey Percheron', blurb: 'A mountain of a horse. Nothing unseats him, and little stops him.',
		coat: 0x8c8c88, mane: 0x3a3836, socks: false, blaze: false, dapple: true,
		stats: { speed: 0.62, accel: 0.5, power: 1.15, steady: 1.0 },
	},
};
export const HORSE_IDS = Object.keys( HORSES );

export const ARMOURS = {
	steel: { name: 'Polished steel', color: 0xb9bcc2, metal: 1, rough: 0.26, trim: 0xd6a526 },
	gilded: { name: 'Gilded', color: 0xe0b04a, metal: 1, rough: 0.28, trim: 0xf4e1a0 },
	blackened: { name: 'Blackened', color: 0x2a2a2e, metal: 0.85, rough: 0.4, trim: 0xb08a3a },
	russet: { name: 'Russet', color: 0x7a4428, metal: 0.9, rough: 0.38, trim: 0xd6a526 },
	azure: { name: 'Blued steel', color: 0x33466e, metal: 0.95, rough: 0.3, trim: 0xd9d9d9 },
};
export const ARMOUR_IDS = Object.keys( ARMOURS );

export const HELMS = {
	greathelm: { name: 'Great helm' },
	frogmouth: { name: 'Frog-mouth' },
	hounskull: { name: 'Hounskull' },
	armet: { name: 'Armet' },
	barbute: { name: 'Open barbute' }, // shows the face
};
export const HELM_IDS = Object.keys( HELMS );

export const PLUMES = {
	none: { name: 'None', color: null },
	red: { name: 'Crimson', color: 0xb01c22 },
	white: { name: 'White', color: 0xf2eee4 },
	gold: { name: 'Gold', color: 0xe0b030 },
	blue: { name: 'Blue', color: 0x2a4aa8 },
	black: { name: 'Raven', color: 0x161416 },
	green: { name: 'Green', color: 0x2a7a3a },
};
export const PLUME_IDS = Object.keys( PLUMES );

export const SKINS = [ 0xf2cfb4, 0xe0b08e, 0xc68a62, 0x9a6440, 0x6a4028 ];
export const HAIRS = [ { name: 'Black', c: 0x1a1410 }, { name: 'Brown', c: 0x5a3820 }, { name: 'Auburn', c: 0x8a3a1a }, { name: 'Blond', c: 0xd4b068 }, { name: 'Grey', c: 0x9a9690 }, { name: 'White', c: 0xe8e4dc } ];
export const BEARDS = [ 'None', 'Stubble', 'Full beard', 'Moustache' ];

export const DEFAULT_KNIGHT = {
	name: 'Sir Robin',
	horse: 'chestnut',
	armour: 'steel',
	helm: 'greathelm',
	plume: 'red',
	skin: 1,
	hair: 1,
	beard: 2,
	arms: { division: 'perPale', field: [ 'azure', 'or' ], charge: 'lion', chargeTincture: 'gules' },
};

export function validKnight( k ) {

	const d = DEFAULT_KNIGHT;
	if ( ! k || typeof k !== 'object' ) return structuredClone( d );
	return {
		name: typeof k.name === 'string' && k.name.trim() ? k.name.trim().slice( 0, 28 ) : d.name,
		horse: HORSES[ k.horse ] ? k.horse : d.horse,
		armour: ARMOURS[ k.armour ] ? k.armour : d.armour,
		helm: HELMS[ k.helm ] ? k.helm : d.helm,
		plume: PLUMES[ k.plume ] ? k.plume : d.plume,
		skin: Number.isInteger( k.skin ) && SKINS[ k.skin ] !== undefined ? k.skin : d.skin,
		hair: Number.isInteger( k.hair ) && HAIRS[ k.hair ] ? k.hair : d.hair,
		beard: Number.isInteger( k.beard ) && BEARDS[ k.beard ] ? k.beard : d.beard,
		arms: k.arms && typeof k.arms === 'object' ? { ...d.arms, ...k.arms } : structuredClone( d.arms ),
	};

}
