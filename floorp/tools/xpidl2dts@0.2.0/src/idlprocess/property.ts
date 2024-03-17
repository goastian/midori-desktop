import { Attribute } from "../defines.js";
import { IDLType2TS } from "../idltype.js";

/**
 * in interface parse
 * `[ATTR] [readonly] attribute [TYPE] [NAME];`
 * to `//PROPERTY [ATTR]\n [readonly] name:type,`
 * @param line line of source
 * @param attr Attribute in this line.
 * if attr contains noscript, return just COMMENT
 * @returns processed line
 */
export function processProperty(line: string, attr: Attribute | null): string {
	console.log(`property: ${line}`);
	const tokens = line.split(" ");
	let index = 0;

	let readonly = false;
	let type: string;
	let name: string;
	if (attr?.values.includes("noscript")) {
		return `///NOSCRIPT ${line}`;
	}
	if (attr?.values.includes("notxpcom")) {
		return `///NOTXPCOM ${line}`;
	}
	//* [readonly]
	{
		readonly = tokens[index] === "readonly";
		if (readonly) index += 1;
	}
	//* attribute
	{
		if (!(tokens[index] === "attribute")) throw Error("this is not property!");
		index += 1;
	}
	//* [TYPE]
	{
		type = IDLType2TS(tokens.slice(index, -1).join(" "));
	}
	//* [NAME]
	{
		name = tokens.slice(-1)[0].replaceAll(/[;\n]/g, "");
		if (name === "function") name = "_function";
	}
	//`//PROPERTY [ATTR]\n [readonly] name:type,`
	return `${attr ? `//PROPERTY ${attr.toLine()}\n` : ""}${
		readonly ? "readonly " : ""
	}${name}:${type};\n`;
}
