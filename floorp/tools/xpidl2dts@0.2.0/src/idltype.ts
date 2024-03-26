const n = "number";
const s = "string";
//const i = "ID object";
const i = "any";
const map: Map<string, string> = new Map(
	Object.entries({
		boolean: "boolean",
		char: s,
		double: n,
		float: n,
		long: n,
		"long long": n,
		octet: n,
		short: n,
		string: n,
		"unsigned long": n,
		"unsigned long long": n,
		"unsigned short": n,
		//? START
		// uint32_t: n,
		// uint64_t: n,
		// int32_t: n,
		// bool: "boolean",
		// int64_t: n,
		//? END
		wchar: s,
		wstring: s,
		MozExternalRefCountType: n,
		//TODO: TYPE
		"Array<T>": "any",
		//nsrootidl.idl
		//PRTime: n,
		//nsresult: n,
		size_t: n,

		nsIDRef: i,
		nsIIDRef: i,
		nsCIDRef: i,
		nsIDPtr: i,
		nsIIDPtr: i,
		nsCIDPtr: i,

		nsQIResult: "object",

		AUTF8String: s,
		ACString: s,
		AString: s,
		jsval: "any",
		Promise: "Promise<any>",

		void: "void",
	}),
);
let unresolvedTypes: string[] = [];
let resolvedTypes: string[] = [];

/**
 * Convert IDLType string to TypeScript Type
 * @param str IDLType
 * @returns TypeScript Type
 */
export function IDLType2TS(str: string): string {
	//https://firefox-source-docs.mozilla.org/xpcom/xpidl.html

	if (str.startsWith("Array<")) {
		return `${IDLType2TS(str.split("<")[1].replace(">", ""))}[]`;
	}

	const ret = map.get(str);
	if (!ret) {
		unresolvedTypes.push(str);
	}
	return ret ? ret : str;
}

export function getUnresolvedTypes(): string[] {
	return [
		...new Set(
			unresolvedTypes.filter((v) => {
				return !resolvedTypes.includes(v);
			}),
		),
	];
}

export function resetUnresolvedTypes() {
	unresolvedTypes = [];
	resolvedTypes = [];
}

/**
 * remove elems like webidl that exposed to dom(js) already
 * @param arr
 */
export function addResolveTypes(arr: string[]) {
	resolvedTypes.push(...arr);
}
