export const trimAllString = (instance: any) => {
    Object.keys(instance).forEach(
        (k) =>
        (instance[k] =
            typeof instance[k] === 'string' ? instance[k].trim() : instance[k]),
    )
}

export function isNumeric(str: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(str)
}

function isInteger(str: string) {
    const num = parseInt(str, 10)
    return !isNaN(num)
}

export function justIntNumbers(value: string): string {
    if (value === null || value === undefined) return value

    if (typeof value === 'string') value = value?.replace(/\s|[^0-9]/g, '')

    if (isInteger(value)) {
        return `${value}`
    }

    return null
}

export function justDateFromDateISO(date: string): string {
    let ret = date
    if (typeof date === 'string' && date.indexOf('T') !== -1)
        ret = date.split('T')[0]
    return ret
}

export function distinct(array: string[]) {
    if (array) return Array.from(new Set(array))

    return null
}

export function escapeRegExp(str: string): string {
    return str?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceAll(str: string, find: string, replace: string) {
    return str?.replace(new RegExp(escapeRegExp(find), 'g'), replace)
}

export const getEnumKey = (obj: any, value: any): string => {
    const keyIndex = Object.values(obj).indexOf(value)

    return Object.keys(obj)[keyIndex]
}

export const removeAccents = (inputText: string) => {
    return inputText.normalize('NFD')?.replace(/[\u0300-\u036f]/g, "")
}
