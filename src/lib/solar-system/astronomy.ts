// The game's own astronomy-engine, imported by file rather than by package
// name so the bundler keeps it a separate module in the game's chunk. The
// package copy the Skychaser pages share is shaken down to what they call; were
// the game to import it too, the calls only the game makes (Jupiter's moons,
// libration, altitude searches) would join the copy every page loads.
export * from '../../../node_modules/astronomy-engine/astronomy';
