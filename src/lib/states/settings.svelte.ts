export const settings = $state<{
	lightMode: 'auto' | 'light' | 'dark';
	theme: 'light' | 'dark';
	mode: 'edit' | 'play';
	speed: number;
}>({
	lightMode: 'auto',
	theme: 'light',
	mode: 'edit',
	speed: 80
});
