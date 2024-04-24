import { Constants } from "../defines.js";

let constants: Constants = {};

/**
 * register Constants for src Comments
 * @param interfaceName
 * @param constantName
 * @param value
 */
export function registerConstant(
  interfaceName: string,
  constantName: string,
  value: string,
) {
  if (!constants[interfaceName]) {
    constants[interfaceName] = {};
  }
  constants[interfaceName][constantName] = value;
}

export function getConstants(): Constants {
  return constants;
}

export function resetConstants() {
  constants = {};
}
