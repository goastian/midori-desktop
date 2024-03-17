import { Attribute } from "../defines.js";
import { IDLType2TS } from "../idltype.js";

/**
 * process Function Arguments like
 * (in int32_t A, inout uint32_t B, [retval] out long long C)
 * @param raw_args
 * @return [args, retval?]
 */
export function processFuncArgs(raw_args: string): [string, string | null] {
	const _raw_args = raw_args.replaceAll(/\/\*.*\*\//g, ""); //remove inside comment
	const arr_args: string[] = [];
	//* split to tokens
	{
		//console.log("split token");
		let index = 0;
		while (index < _raw_args.length) {
			let _buf = "";
			if (_raw_args.startsWith("[", index)) {
				const idx_end_square_bracket = _raw_args.indexOf("]", index);
				_buf += _raw_args.slice(index, idx_end_square_bracket + 1);
				index = idx_end_square_bracket + 1;
				//console.log(`startsWith[ ${_buf}`);
			}
			const idx_comma = _raw_args.indexOf(",", index);
			//console.log(`idx_comma : ${idx_comma}`);
			if (idx_comma === -1) {
				arr_args.push(_buf + _raw_args.slice(index));
				break;
			}
			_buf += _raw_args.slice(index, idx_comma);
			index = idx_comma + 1;
			//console.log(`_buf: ${_buf}`);
			arr_args.push(_buf);
			//* remove whitespace after comma
			while (_raw_args[index] === " ") {
				index += 1;
			}
		}

		//console.log(`split end:${arr_args}`);
	}
	let ret_type_retval: string | null = null;
	const ret_args = [];
	for (const elem of arr_args) {
		let _attribute: Attribute | null;
		let _elem: string;
		//* attribute
		{
			//console.log(`elem:${elem}`);
			if (elem.startsWith("[")) {
				[_attribute, _elem] = Attribute.fromLine(elem);
			} else {
				_attribute = null;
				_elem = elem;
			}
		}

		let index = 0;
		const tokens = _elem.split(" ");
		let type: string;
		let name: string;

		let mode;

		//* `in` or `out` or `inout`
		{
			if (
				!(
					tokens[index] === "in" ||
					tokens[index] === "out" ||
					tokens[index] === "inout"
				)
			) {
				mode = "in?";
			} else {
				mode = tokens[index];
			}
			//throw Error("function args not starts with `in` or `out` or `inout`");
			index += 1;
		}
		//* [TYPE]
		{
			type = IDLType2TS(tokens.slice(index, -1).join(" "));
		}
		//* [NAME]
		{
			name = tokens.slice(-1)[0];
			if (name === "function") name = "_function";
		}

		//* check retval of attribute
		if (_attribute?.values.includes("retval")) {
			ret_type_retval = type;
		} else {
			//console.log(`name: ${name}`);
			ret_args.push(`${name}: ${type},///${mode}\n`);
		}
	}
	return [ret_args.join(""), ret_type_retval];
}

/**
 * process XPIDL Function to TS Format
 * @param line line to process
 * @param attr attribute of the line
 * @returns [line]
 */
export function processFunction(line: string, attr: Attribute | null): string {
	if (attr?.values.includes("noscript") || attr?.values.includes("notxpcom"))
		return "";
	//console.log("processFunction start");
	//console.log(line);
	const _first = line.slice(0, line.indexOf("("));
	const _second = line.slice(line.indexOf("(") + 1);
	//console.log(`${_first}, ${_second}`);

	const [func_name, ret_type] = (() => {
		const _arr_first = _first.trim().split(" ");
		return [_arr_first.pop(), IDLType2TS(_arr_first.join(" "))];
	})();

	const raw_args = _second.replace(");", "").trim();
	//console.log(raw_args);

	let args: string;
	let args_retval: string | null;
	if (raw_args) {
		[args, args_retval] = processFuncArgs(raw_args);
	} else {
		[args, args_retval] = ["", null];
	}

	return `${
		attr ? `///FUNCTION ${attr.toLine()}\n` : ""
	}${func_name}: (${args}) => ${args_retval ? args_retval : ret_type};\n`;
}
