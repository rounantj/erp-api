/**
 * Gerador de senhas seguras para novos usuários
 * Gera senhas aleatórias no formato: Fofa@{random}
 */

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NUMBERS = '23456789';
const SPECIAL = '@#$!';

/**
 * Gera uma senha aleatória segura
 * @param length Tamanho da senha (mínimo 8, padrão 10)
 * @returns Senha gerada
 */
export function generateSecurePassword(length: number = 10): string {
    if (length < 8) length = 8;
    
    // Garante pelo menos um de cada tipo
    const requiredChars = [
        UPPERCASE[Math.floor(Math.random() * UPPERCASE.length)],
        LOWERCASE[Math.floor(Math.random() * LOWERCASE.length)],
        NUMBERS[Math.floor(Math.random() * NUMBERS.length)],
        SPECIAL[Math.floor(Math.random() * SPECIAL.length)],
    ];
    
    // Caracteres restantes
    const allChars = LOWERCASE + UPPERCASE + NUMBERS;
    const remaining = length - requiredChars.length;
    
    for (let i = 0; i < remaining; i++) {
        requiredChars.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }
    
    // Embaralha os caracteres
    return shuffleArray(requiredChars).join('');
}

/**
 * Gera uma senha amigável no formato Fofa@{random}
 * @returns Senha no formato Fofa@XXXXX
 */
export function generateFriendlyPassword(): string {
    const randomPart = generateRandomString(6);
    return `Fofa@${randomPart}`;
}

/**
 * Gera uma string aleatória com letras e números
 * @param length Tamanho da string
 * @returns String aleatória
 */
function generateRandomString(length: number): string {
    const chars = LOWERCASE + UPPERCASE + NUMBERS;
    let result = '';
    
    // Garante pelo menos uma maiúscula e um número
    result += UPPERCASE[Math.floor(Math.random() * UPPERCASE.length)];
    result += NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
    
    for (let i = 2; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    
    return shuffleArray(result.split('')).join('');
}

/**
 * Embaralha um array usando Fisher-Yates
 */
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}



