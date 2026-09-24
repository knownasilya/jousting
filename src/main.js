import { App } from './App.js';
import { UI } from './ui/UI.js';

const ui = new UI();
const app = new App( document.getElementById( 'app' ), ui );
window.__app = app;

app.init( ( p, text ) => ui.setLoading( p, text ) ).then( async () => {

	await ui.hideLoader();
	app.start();

} ).catch( ( e ) => {

	console.error( e );
	ui.setLoadingError( e.message );

} );
