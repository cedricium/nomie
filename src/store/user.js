// Utils
import Logger from '../utils/log/log';
import { writable } from 'svelte/store';

// Modules
import locate from '../modules/locate/locate';
import Storage from '../modules/storage/storage';

// Stores
import { TrackerStore } from './trackers';
import { BoardStore } from './boards';

import config from '../../config/global';

const console = new Logger('🤠 userStore');

const UserSession = new blockstack.UserSession();

const userInit = () => {
	let listeners = [];

	let state = {
		ready: false,
		signedIn: undefined,
		profile: {
			username: null,
		},
		alwaysLocate: JSON.parse(localStorage.getItem(config.always_locate_key) || 'false'),
		darkMode: JSON.parse(localStorage.getItem(config.dark_mode_key) || 'false'),
		location: null,
		meta: {
			lock: false,
			pin: null,
		},
		locked: true,
	};

	const { subscribe, set, update } = writable(state);

	const methods = {
		initialize() {
			// Set Dark or Light Mode
			if (state.darkMode) {
				document.body.classList.add('dark');
			} else {
				document.body.classList.remove('dark');
			}
			// Is blockstack user pending?
			if (UserSession.isSignInPending()) {
				UserSession.handlePendingSignIn().then(userData => {
					// redirect user to home - to avoid having the
					// blockstack authkey hanging around.
					window.location.href = '/';
				});
			} else if (UserSession.isUserSignedIn()) {
				// Signed In - let's get the user Ready
				methods.setProfile(UserSession.loadUserData());
			} else {
				update(u => {
					u.ready = true;
					u.signedIn = false;
					return u;
				});
			}
			// set highlevel initialize marker

			// TODO: Add 10 minute interval to check for day change - if change, fire a new user.ready
		},
		/**
		 * Set Profile and Signin
		 */
		setProfile(profile) {
			// Fire off the remaining bootstrap items.
			methods.bootstrap();
			// Update store with new profile.
			update(p => {
				p.profile = profile;
				p.signedIn = true;
				return p;
			});
		},
		bootstrap() {
			let start = new Date().getTime();
			// First lets get the TrackerStore loaded
			let promises = [];
			promises.push(methods.loadMeta());
			promises.push(
				TrackerStore.initialize().then(trackers => {
					// Now lets load the BoardStore and pass these trackers
					return BoardStore.initialize(trackers).then(() => {
						// Now let's fire off that we're ready
						if (state.alwaysLocate) {
							methods.locate();
						}
					});
				})
			);

			return Promise.all(promises).then(() => {
				return methods.fireReady(state);
			});
		},
		reset() {
			update(u => state);
		},
		redirectToSignIn() {
			UserSession.redirectToSignIn();
		},
		setAlwaysLocate(bool) {
			localStorage.setItem(config.always_locate_key, JSON.stringify(bool));
			update(u => {
				u.alwaysLocate = bool;
				return u;
			});
		},
		unlock() {
			update(usr => {
				usr.locked = false;
				return usr;
			});
		},
		loadMeta() {
			return Storage.get(config.user_meta_path).then(value => {
				if (value) {
					update(usr => {
						usr.meta = value;
						return usr;
					});
				}
			});
		},
		saveMeta() {
			let usr = this.data();
			if (Object.keys(usr.meta).length) {
				return Storage.put(config.user_meta_path, usr.meta);
			}
		},
		data() {
			let d;
			update(usr => {
				d = usr;
				return usr;
			});
			return d;
		},
		setDarkMode(bool) {
			localStorage.setItem(config.dark_mode_key, JSON.stringify(bool));
			if (bool) {
				document.body.classList.add('dark');
			} else {
				document.body.classList.remove('dark');
			}
			update(u => {
				u.darkMode = bool;
				return u;
			});
		},
		locate() {
			return locate()
				.then(location => {
					update(u => {
						u.location = location;
						return u;
					});
					return location;
				})
				.catch(e => {
					console.error('Getting Location', e.message);
				});
		},
		session() {
			return UserSession;
		},
		onReady(func) {
			if (this.ready === true) {
				func(state);
			} else {
				listeners.push(func);
			}
		},
		fireReady(payload) {
			update(b => {
				b.ready = true;
				return b;
			});
			listeners.forEach(func => {
				func(payload);
			});
			listeners = [];
		},

		listFiles() {
			return new Promise((resolve, reject) => {
				let files = [];
				blockstack
					.listFiles(file => {
						if (files.indexOf(file) == -1) {
							files.push(file);
						}
						return true;
					})
					.then(() => {
						resolve(files);
					});
			});
		},
	};

	return {
		subscribe,
		set,
		update,
		...methods,
		boards: BoardStore,
		trackers: TrackerStore,
	};
};

export const UserStore = userInit();
