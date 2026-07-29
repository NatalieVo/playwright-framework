export class TestData {
  static generateEmail(prefix: string = 'test'): string {
    return `${prefix}_${Date.now()}@auto.test`;
  }

  static generateUsername(prefix: string = 'auto_user'): string {
    return `${prefix}_${Date.now()}`;
  }

  static generateCode(prefix: string = 'TC'): string {
    return `${prefix}_${Date.now()}`;
  }

  static generateFileName(prefix: string = 'auto_file', ext: string = 'txt'): string {
    return `${prefix}_${Date.now()}.${ext}`;
  }

  static generateFolderName(prefix: string = 'auto_folder'): string {
    return `${prefix}_${Date.now()}`;
  }

  static generatePhoneVN(): string {
    const suffixes = ['032', '033', '034', '035', '036', '037', '038', '039',
      '096', '097', '098', '086', '083', '084', '085', '081', '082',
      '070', '079', '077', '076', '078', '089', '090', '093'];
    const prefix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const digits = String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0');
    return `${prefix}${digits}`;
  }

  static generateFullName(): string {
    const firstNames = ['Nguyen Van', 'Tran Thi', 'Le Van', 'Pham Thi', 'Hoang Van'];
    const lastNames = ['An', 'Binh', 'Cuong', 'Dung', 'Huong'];
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
  }

  static randomString(length: number = 8): string {
    return Math.random().toString(36).substring(2, length + 2);
  }

  static currentTimestamp(): string {
    return String(Date.now());
  }
}
