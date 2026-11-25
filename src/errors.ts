/** The caller's input can't be used; the message tells them how to fix it. */
export class VtestInputError extends Error {
	override name = "VtestInputError";
}

/** vtest.be answered with something we can't read as results. */
export class VtestResponseError extends Error {
	override name = "VtestResponseError";
}
