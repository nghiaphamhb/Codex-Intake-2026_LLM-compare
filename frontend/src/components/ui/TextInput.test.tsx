import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('associates input with label via generated id and finds input via label text', () => {
    render(<TextInput label="User query" placeholder="Enter query..." />);
    const input = screen.getByLabelText('User query');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('placeholder', 'Enter query...');
  });

  it('updates value and triggers onChange on typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TextInput label="Search model" onChange={handleChange} />);

    const input = screen.getByLabelText('Search model');
    await user.type(input, 'GPT-4');

    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue('GPT-4');
  });

  it('renders visually hidden label so that placeholder does not replace label', () => {
    const { container } = render(<TextInput label="Hidden description" placeholder="Hint" />);
    const label = container.querySelector('label');
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent('Hidden description');
    // Ensure label is visually hidden via CSS module class
    expect(label?.className).toMatch(/visuallyHidden/);
  });

  it('respects disabled attribute', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TextInput disabled label="Disabled input" onChange={handleChange} />);

    const input = screen.getByLabelText('Disabled input');
    expect(input).toBeDisabled();

    await user.type(input, 'test');
    expect(handleChange).not.toHaveBeenCalled();
  });
});

