export const settings = $state<{
	theme: 'light' | 'dark';
	mode: 'edit' | 'play';
	speed: number;
}>({
	theme: 'light',
	mode: 'edit',
	speed: 80
});
