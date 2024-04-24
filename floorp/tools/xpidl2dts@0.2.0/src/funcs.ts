import { registerConstant } from "./post-processing/constants2list.js";
import { Attribute } from "./defines.js";
import { IDLType2TS, addResolveTypes } from "./idltype.js";
import { processProperty } from "./idlprocess/property.js";
import { processFunction } from "./idlprocess/function.js";
import { processCENUM } from "./idlprocess/cenum.js";

let not_scriptable_interface = false;
let interfaceName = "";
export function processLine(
	line: string,
	obj_export_ident: { type: string[]; interface: string[] },
): string {
	let attribute: Attribute | null = null;
	let _line = line;

	if (not_scriptable_interface) {
		if (_line.trim().startsWith("};")) {
			not_scriptable_interface = false;
		}
		return "";
	}
	console.log(`_line = ${_line}`);

	//* ATTRIBUTE
	if (_line.startsWith("[")) {
		[attribute, _line] = Attribute.fromLine(_line);
	}

	//* reject native
	//TODO: move to some function
	if (_line.startsWith("native ")) {
		return `///NATIVE ${line}`;
	}

	//* change #import to comment
	if (_line.startsWith("#include ")) {
		return `///INCLUDE ${line}`;
	}

	// [attr] interface [NAME] : [EXTEND_FROM] {}
	if (_line.startsWith("interface ")) {
		const _tmp = _line.split(":");
		const _interfaceName = _tmp[0]
			.replace("interface", "")
			.replace("{", "")
			.trim();
		if (!attribute?.values.includes("scriptable") && !_line.includes(";")) {
			not_scriptable_interface = true;
			return "";
		}
		if (_tmp.length > 1) {
			IDLType2TS(_tmp[1].replace("{", "").trim()); ///for add unresolved types
		}
		_line = `export ${_tmp.join(" extends ").replaceAll(/[ ]+/g, " ")}`;
		if (_line.includes(";")) {
			_line = `///ONELINE_INTERFACE ${_line.replace(";", " {}")}`;
		} else {
			obj_export_ident.interface.push(_interfaceName);
			interfaceName = _interfaceName;
		}
	}

	//* PROPERTY
	if (_line.startsWith("attribute ") || _line.startsWith("readonly ")) {
		_line = processProperty(_line, attribute);
	}
	//* CONST
	else if (_line.startsWith("const ")) {
		const _tmp = _line.split("=")[0].trim().replace("const ", "");
		const _type = IDLType2TS(_tmp.slice(0, _tmp.lastIndexOf(" ")));
		const _name = _tmp.slice(_tmp.lastIndexOf(" ") + 1);
		const _value = _line.split("=")[1].trim().replace(";", "");
		_line = `///CONST ${_value}\nreadonly ${_name}: ${_type};\n`;
		registerConstant(interfaceName, _name, _value);
	}
	//* TYPEDEF
	else if (_line.startsWith("typedef ")) {
		const tokens = _line.split(" ");
		//0 is typedef keyword
		const type = IDLType2TS(tokens.slice(1, -1).join(" "));
		const name = tokens.slice(-1)[0].replace(";\n", "");
		_line = `export type ${name} = ${type};\n`;
		obj_export_ident.type.push(name);
	} else if (_line.startsWith("webidl ")) {
		const tokens = _line.split(" ");
		//0 is webidl keyword
		const name = tokens[1].replace(";", "").trim();
		addResolveTypes([name]);
		_line = `///WEBIDL ${name}\n`;
	}
	//* CENUM
	else if (line.startsWith("cenum ")) {
		_line = processCENUM(line);
	}
	//* INTERFACE
	else if (
		_line.startsWith("interface ") ||
		_line.endsWith("]") ||
		_line.endsWith("};")
	) {
	} else if (_line.trim() === "") {
	}
	//* FUNCTION
	else if (_line.includes("(")) {
		_line = processFunction(_line, attribute);
		//if (_line && obj_export_ident) obj_export_ident.func.push(funcName);
	}

	return _line;
}
