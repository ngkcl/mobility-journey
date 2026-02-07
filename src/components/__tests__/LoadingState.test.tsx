import { render, screen } from '@testing-library/react';
import LoadingState from '../LoadingState';

describe('LoadingState', () => {
  it('renders the provided label', () => {
    render(<LoadingState label="Fetching updates" />);

    expect(screen.getByText('Fetching updates')).toBeInTheDocument();
  });
});
