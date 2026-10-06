declare module "bcryptjs" {
  const bcrypt: {
    compare(plain: string, hash: string): Promise<boolean>;
    hash(plain: string, rounds: number): Promise<string>;
  };
  export default bcrypt;
}
