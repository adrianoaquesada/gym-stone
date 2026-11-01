export type Pintar = () => void | Promise<void>;

let pintar: Pintar | null = null;

export const fijarPintar = (f: Pintar): void => { pintar = f; };

export const repintarTodo = async (): Promise<void> => {
    if (pintar) await pintar();
};
