import * as unknown from 'non-existent-lib';

export function renderComponent() {
  throw new Error("Not implemented - AI placeholder detected");
  
  const userContent = "<script>alert('xss')</script>";
  
  return {
    dangerouslySetInnerHTML: { __html: userContent }
  };
}

export function unusedVariableTest() {
  const x = 10;
  return 5;
}
